// Second factor (decisions §11.9–11.10): TOTP (server-readable secret,
// AES-GCM at rest), WebAuthn (@simplewebauthn/server; origin + RP ID
// checked, user verification preferred) and 10 one-time recovery codes.
// MFA is mandatory; enrolling the first method also passes MFA for the
// current session and issues recovery codes.
import { randomBytes } from "node:crypto";
import { APP_NAME, type MfaMethod, type MfaOverviewResponse } from "@repo/types";
import {
  type AuthenticationResponseJSON,
  generateAuthenticationOptions,
  generateRegistrationOptions,
  type RegistrationResponseJSON,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import type { Redis } from "ioredis";
import type { SecurityConfig } from "../../config/security";
import { isUniqueViolation } from "../../db/errors";
import { type Actor, auditActor } from "../../lib/actor";
import { badRequest, conflict, notFound } from "../../lib/errors";
import type { RequestMeta } from "../../lib/http";
import { hmac, openServerSecret, sealServerSecret } from "../../lib/secrets";
import { generateTotpSecret, otpauthUri, verifyTotp } from "../../lib/totp";
import type { AuditService } from "../audit";
import type { DevicesService } from "../devices";
import type { EmailSender } from "../email";
import type { SessionContext, SessionsService } from "../sessions";
import type { UsersService } from "../users";
import type { MfaRepository } from "./mfa.repository";

export const RECOVERY_CODE_COUNT = 10;
const CHALLENGE_TTL_SECONDS = 300;
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

const challengeKey = (kind: "reg" | "auth", sessionId: string) => `webauthn:${kind}:${sessionId}`;

/** 10 Crockford base32 chars (50 bits) shown as XXXXX-XXXXX. */
function generateRecoveryCode(): string {
  const chars = [...randomBytes(10)].map((b) => CROCKFORD.charAt(b & 31)).join("");
  return `${chars.slice(0, 5)}-${chars.slice(5)}`;
}

function normalizeRecoveryCode(code: string): string {
  return code.toUpperCase().replace(/[\s-]/g, "").replaceAll("O", "0").replace(/[IL]/g, "1");
}

export interface MfaDeps {
  repo: MfaRepository;
  redis: Redis;
  config: SecurityConfig;
  users: UsersService;
  sessions: SessionsService;
  devices: DevicesService;
  audit: AuditService;
  email: EmailSender;
}

export function createMfaService(deps: MfaDeps) {
  const { repo, redis, config, audit } = deps;

  const recoveryCodeHash = (code: string) =>
    hmac(config.hmacKey, "mfa-recovery-code", normalizeRecoveryCode(code)).toString("hex");

  /** Enrolled second factors (not counting recovery codes). */
  async function enrolledCount(actor: Actor): Promise<number> {
    const [totp, webauthn] = await Promise.all([
      repo.getTotp(actor.tenant),
      repo.listWebAuthn(actor.tenant),
    ]);
    return (totp?.confirmedAt ? 1 : 0) + webauthn.length;
  }

  async function issueRecoveryCodes(actor: Actor): Promise<string[]> {
    const codes = Array.from({ length: RECOVERY_CODE_COUNT }, generateRecoveryCode);
    await repo.replaceRecoveryCodes(actor.tenant, codes.map(recoveryCodeHash));
    return codes;
  }

  /** After a successful enrollment: MFA passes for this session; first method → codes. */
  async function afterEnroll(
    actor: Actor,
    session: SessionContext,
    wasFirst: boolean,
  ): Promise<string[] | null> {
    await deps.sessions.markMfaVerified(actor.tenant, session);
    await deps.users.invalidateState(actor.userId);
    return wasFirst ? issueRecoveryCodes(actor) : null;
  }

  async function assertNotLastMethod(actor: Actor): Promise<void> {
    if ((await enrolledCount(actor)) <= 1) {
      throw conflict("Add another two-step login method before removing this one");
    }
  }

  /** After a passed challenge: mark the session, optionally trust the device, audit. */
  async function afterVerified(
    actor: Actor,
    session: SessionContext,
    method: MfaMethod,
    trustDevice: boolean,
    request: RequestMeta,
  ): Promise<void> {
    await deps.sessions.markMfaVerified(actor.tenant, session);
    await audit.record({
      action: "auth.mfa_verified",
      actor: auditActor(actor),
      target: { type: "session", id: session.id },
      request,
      metadata: { method },
    });
    if (trustDevice) await deps.devices.trust(actor, request);
  }

  async function failed(actor: Actor, method: MfaMethod, request: RequestMeta): Promise<never> {
    await audit.record({
      action: "auth.mfa_failed",
      actor: auditActor(actor),
      request,
      metadata: { method },
    });
    throw badRequest("That code didn't work. Try again.");
  }

  async function notifyRemoved(email: string, method: string): Promise<void> {
    await deps.email.send({
      to: email,
      template: "mfa_removed",
      data: { method, at: new Date().toISOString() },
    });
  }

  return {
    /** Methods this user can be challenged with. */
    async methods(actor: Pick<Actor, "tenant">): Promise<MfaMethod[]> {
      const [totp, webauthn, codes] = await Promise.all([
        repo.getTotp(actor.tenant),
        repo.listWebAuthn(actor.tenant),
        repo.countUnusedRecoveryCodes(actor.tenant),
      ]);
      const methods: MfaMethod[] = [];
      if (totp?.confirmedAt) methods.push("totp");
      if (webauthn.length > 0) methods.push("webauthn");
      if (codes > 0) methods.push("recovery_code");
      return methods;
    },

    async overview(actor: Actor): Promise<MfaOverviewResponse> {
      const [totp, webauthn, codes] = await Promise.all([
        repo.getTotp(actor.tenant),
        repo.listWebAuthn(actor.tenant),
        repo.countUnusedRecoveryCodes(actor.tenant),
      ]);
      return {
        totp: {
          enabled: totp?.confirmedAt != null,
          confirmedAt: totp?.confirmedAt?.toISOString() ?? null,
        },
        webauthn: webauthn.map((c) => ({
          id: c.id,
          name: c.name,
          createdAt: c.createdAt.toISOString(),
          lastUsedAt: c.lastUsedAt?.toISOString() ?? null,
        })),
        recoveryCodesRemaining: codes,
      };
    },

    // --- TOTP enrollment

    async totpSetup(actor: Actor, email: string) {
      const existing = await repo.getTotp(actor.tenant);
      if (existing?.confirmedAt) throw conflict("An authenticator app is already set up");
      const secret = generateTotpSecret();
      await repo.upsertPendingTotp(actor.tenant, sealServerSecret(config.encryptionKey, secret));
      return { secret, otpauthUri: otpauthUri({ issuer: APP_NAME, account: email, secret }) };
    },

    async totpConfirm(
      actor: Actor,
      session: SessionContext,
      code: string,
      request: RequestMeta,
    ): Promise<string[] | null> {
      const pending = await repo.getTotp(actor.tenant);
      if (!pending || pending.confirmedAt) throw badRequest("Start authenticator setup first");
      const secret = openServerSecret(config.encryptionKey, pending.encryptedSecret);
      const step = verifyTotp(secret, code, { nowMs: Date.now(), lastUsedStep: null });
      if (step === null) throw badRequest("That code didn't work. Check the time on your phone.");

      const wasFirst = (await enrolledCount(actor)) === 0;
      if (!(await repo.confirmTotp(actor.tenant, step, new Date()))) {
        throw conflict("Authenticator setup changed; start again");
      }
      await audit.record({
        action: "mfa.totp_enabled",
        actor: auditActor(actor),
        request,
      });
      return afterEnroll(actor, session, wasFirst);
    },

    async totpDisable(actor: Actor, email: string, request: RequestMeta): Promise<void> {
      const totp = await repo.getTotp(actor.tenant);
      if (!totp?.confirmedAt) throw notFound("No authenticator app is set up");
      await assertNotLastMethod(actor);
      await repo.deleteTotp(actor.tenant);
      await deps.users.invalidateState(actor.userId);
      await audit.record({ action: "mfa.totp_disabled", actor: auditActor(actor), request });
      await notifyRemoved(email, "authenticator app");
    },

    // --- Challenge (login)

    async verifyCode(
      actor: Actor,
      session: SessionContext,
      input: { method: "totp" | "recovery_code"; code: string; trustDevice: boolean },
      request: RequestMeta,
    ): Promise<void> {
      if (input.method === "totp") {
        const totp = await repo.getTotp(actor.tenant);
        if (!totp?.confirmedAt) return failed(actor, "totp", request);
        const secret = openServerSecret(config.encryptionKey, totp.encryptedSecret);
        const step = verifyTotp(secret, input.code, {
          nowMs: Date.now(),
          lastUsedStep: totp.lastUsedStep,
        });
        if (step === null || !(await repo.useTotpStep(actor.tenant, step))) {
          return failed(actor, "totp", request);
        }
      } else if (
        !(await repo.useRecoveryCode(actor.tenant, recoveryCodeHash(input.code), new Date()))
      ) {
        return failed(actor, "recovery_code", request);
      }
      await afterVerified(actor, session, input.method, input.trustDevice, request);
    },

    // --- WebAuthn

    async webauthnRegisterOptions(actor: Actor, session: SessionContext, email: string) {
      const existing = await repo.listWebAuthn(actor.tenant);
      const options = await generateRegistrationOptions({
        rpName: APP_NAME,
        rpID: config.rpId,
        userName: email,
        userID: new TextEncoder().encode(actor.userId),
        attestationType: "none",
        excludeCredentials: existing.map((c) => ({ id: c.credentialId, transports: c.transports })),
        // Second factor only: no discoverable credential needed.
        authenticatorSelection: { residentKey: "discouraged", userVerification: "preferred" },
      });
      await redis.set(
        challengeKey("reg", session.id),
        options.challenge,
        "EX",
        CHALLENGE_TTL_SECONDS,
      );
      return options;
    },

    async webauthnRegisterVerify(
      actor: Actor,
      session: SessionContext,
      input: { response: Record<string, unknown>; name: string },
      request: RequestMeta,
    ): Promise<string[] | null> {
      const expectedChallenge = await redis.getdel(challengeKey("reg", session.id));
      if (!expectedChallenge) throw badRequest("Security key setup timed out; try again");

      let info: Awaited<ReturnType<typeof verifyRegistrationResponse>>["registrationInfo"];
      try {
        const result = await verifyRegistrationResponse({
          response: input.response as unknown as RegistrationResponseJSON,
          expectedChallenge,
          expectedOrigin: config.appOrigin,
          expectedRPID: config.rpId,
          requireUserVerification: false,
        });
        info = result.verified ? result.registrationInfo : undefined;
      } catch {
        info = undefined;
      }
      if (!info) throw badRequest("Security key couldn't be verified");

      const wasFirst = (await enrolledCount(actor)) === 0;
      let credential: Awaited<ReturnType<MfaRepository["createWebAuthn"]>>;
      try {
        credential = await repo.createWebAuthn(actor.tenant, {
          credentialId: info.credential.id,
          publicKey: new Uint8Array(info.credential.publicKey),
          signCount: BigInt(info.credential.counter),
          transports: info.credential.transports ?? [],
          name: input.name,
        });
      } catch (err) {
        if (isUniqueViolation(err)) throw conflict("This security key is already registered");
        throw err;
      }
      await audit.record({
        action: "mfa.webauthn_added",
        actor: auditActor(actor),
        target: { type: "webauthn_credential", id: credential.id },
        request,
        metadata: { name: input.name },
      });
      return afterEnroll(actor, session, wasFirst);
    },

    async webauthnAuthOptions(actor: Actor, session: SessionContext) {
      const credentials = await repo.listWebAuthn(actor.tenant);
      if (credentials.length === 0) throw badRequest("No security keys are registered");
      const options = await generateAuthenticationOptions({
        rpID: config.rpId,
        allowCredentials: credentials.map((c) => ({
          id: c.credentialId,
          transports: c.transports,
        })),
        userVerification: "preferred",
      });
      await redis.set(
        challengeKey("auth", session.id),
        options.challenge,
        "EX",
        CHALLENGE_TTL_SECONDS,
      );
      return options;
    },

    async webauthnAuthVerify(
      actor: Actor,
      session: SessionContext,
      input: { response: Record<string, unknown>; trustDevice: boolean },
      request: RequestMeta,
    ): Promise<void> {
      const expectedChallenge = await redis.getdel(challengeKey("auth", session.id));
      const response = input.response as unknown as AuthenticationResponseJSON;
      const credential =
        expectedChallenge && typeof response.id === "string"
          ? await repo.findWebAuthn(actor.tenant, response.id)
          : null;
      if (!expectedChallenge || !credential) return failed(actor, "webauthn", request);

      let newCounter: number | undefined;
      try {
        const result = await verifyAuthenticationResponse({
          response,
          expectedChallenge,
          expectedOrigin: config.appOrigin,
          expectedRPID: config.rpId,
          credential: {
            id: credential.credentialId,
            publicKey: new Uint8Array(credential.publicKey),
            counter: Number(credential.signCount),
            transports: credential.transports,
          },
          requireUserVerification: false,
        });
        if (result.verified) newCounter = result.authenticationInfo.newCounter;
      } catch {
        newCounter = undefined;
      }
      if (newCounter === undefined) return failed(actor, "webauthn", request);

      await repo.updateWebAuthnUse(actor.tenant, credential.id, BigInt(newCounter), new Date());
      await afterVerified(actor, session, "webauthn", input.trustDevice, request);
    },

    async webauthnRemove(
      actor: Actor,
      credentialId: string,
      email: string,
      request: RequestMeta,
    ): Promise<void> {
      const exists = (await repo.listWebAuthn(actor.tenant)).some((c) => c.id === credentialId);
      if (!exists) throw notFound("Security key not found");
      await assertNotLastMethod(actor);
      await repo.deleteWebAuthn(actor.tenant, credentialId);
      await deps.users.invalidateState(actor.userId);
      await audit.record({
        action: "mfa.webauthn_removed",
        actor: auditActor(actor),
        target: { type: "webauthn_credential", id: credentialId },
        request,
      });
      await notifyRemoved(email, "security key");
    },

    // --- Recovery codes

    async regenerateRecoveryCodes(actor: Actor, request: RequestMeta): Promise<string[]> {
      const codes = await issueRecoveryCodes(actor);
      await audit.record({
        action: "mfa.recovery_codes_regenerated",
        actor: auditActor(actor),
        request,
      });
      return codes;
    },
  };
}

export type MfaService = ReturnType<typeof createMfaService>;
