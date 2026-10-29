// Accounts: prelogin, signup, email verification, login/logout, the session
// state, master password change and account recovery (decisions §11).
// The server only ever receives authKey / recoveryAuthKey (hashed again
// here with Argon2id) and client-encrypted key material.
import { randomUUID } from "node:crypto";
import type {
  ChangePasswordRequest,
  KdfParams,
  LoginRequest,
  PasswordMaterial,
  PreloginResponse,
  RecoverCompleteRequest,
  RecoverStartRequest,
  RecoverStartResponse,
  RotateRecoveryKeyRequest,
  SessionResponse,
  SignupRequest,
} from "@repo/types";
import {
  EMAIL_VERIFY_TTL_MS,
  RECOVERY_TOKEN_TTL_MS,
  type SecurityConfig,
} from "../../config/security";
import { isUniqueViolation } from "../../db/errors";
import { userTenant } from "../../db/tenant";
import { type Actor, auditActor } from "../../lib/actor";
import { AppError, badRequest, unauthorized } from "../../lib/errors";
import type { RequestMeta } from "../../lib/http";
import {
  createDummyVerifier,
  hashSecret,
  hmac,
  randomToken,
  sha256Hex,
  verifySecret,
} from "../../lib/secrets";
import { sessionStep } from "../../lib/session-step";
import type { AuditService } from "../audit";
import type { DevicesService } from "../devices";
import type { EmailSender } from "../email";
import type { LegalService } from "../legal";
import type { MfaService } from "../mfa";
import type { SessionContext, SessionsService } from "../sessions";
import type { PasswordColumns, UsersService } from "../users";
import type { AuthRepository } from "./auth.repository";

/** Matches @repo/crypto DEFAULT_KDF_PARAMS: what unknown emails get from prelogin. */
const DEFAULT_KDF: KdfParams = { alg: "argon2id", memoryKiB: 65536, iterations: 3, parallelism: 1 };

export interface AuthDeps {
  repo: AuthRepository;
  config: SecurityConfig;
  users: UsersService;
  sessions: SessionsService;
  devices: DevicesService;
  mfa: MfaService;
  legal: LegalService;
  audit: AuditService;
  email: EmailSender;
}

export function createAuthService(deps: AuthDeps) {
  const { repo, config, users, sessions, audit } = deps;
  const dummyVerify = createDummyVerifier(config.secretHash);
  const hash = (secret: string) => hashSecret(secret, config.secretHash);
  const now = () => new Date();
  const link = (path: string) => `${config.appOrigin}${path}`;

  async function passwordColumns(m: PasswordMaterial): Promise<PasswordColumns> {
    return {
      kdfAlg: m.kdf.alg,
      kdfMemoryKib: m.kdf.memoryKiB,
      kdfIterations: m.kdf.iterations,
      kdfParallelism: m.kdf.parallelism,
      kdfSalt: m.kdfSalt,
      authHash: await hash(m.authKey),
      encryptedUserKey: m.encryptedUserKey,
    };
  }

  async function issueToken(
    userId: string,
    purpose: "email_verify" | "account_recovery",
    ttlMs: number,
  ): Promise<string> {
    const token = randomToken();
    await repo.createToken({
      userId,
      purpose,
      tokenHash: sha256Hex(token),
      expiresAt: new Date(Date.now() + ttlMs),
    });
    return token;
  }

  async function sendVerification(userId: string, email: string): Promise<void> {
    const token = await issueToken(userId, "email_verify", EMAIL_VERIFY_TTL_MS);
    // In the fragment, so the token never reaches server/proxy logs or Referer headers.
    await deps.email.send({
      to: email,
      template: "verify_email",
      data: { link: link(`/verify-email#token=${token}`) },
    });
  }

  /** Current session state for the client: next step, and keys once ready. */
  async function sessionResponse(
    userId: string,
    session: SessionContext,
  ): Promise<SessionResponse> {
    const tenant = userTenant(userId);
    const [state, pendingLegal, mfaMethods] = await Promise.all([
      users.getState(userId),
      deps.legal.pending(userId),
      deps.mfa.methods({ tenant }),
    ]);
    if (!state) throw unauthorized();
    const step = sessionStep({
      mfaEnabled: state.mfaEnabled,
      mfaVerified: session.mfaVerified,
      pendingLegal: pendingLegal.length,
    });
    // Keys (still encrypted) only once every gate has passed.
    const user = step === "ready" ? await users.findById(userId) : null;
    return {
      step,
      user: { id: state.id, email: state.email, emailVerified: state.emailVerified },
      mfaMethods,
      pendingLegal,
      keys: user
        ? {
            kdf: {
              alg: "argon2id",
              memoryKiB: user.kdfMemoryKib,
              iterations: user.kdfIterations,
              parallelism: 1,
            },
            kdfSalt: user.kdfSalt,
            encryptedUserKey: user.encryptedUserKey,
            publicKey: user.publicKey,
            encryptedPrivateKey: user.encryptedPrivateKey,
          }
        : null,
    };
  }

  return {
    sessionResponse,

    /** KDF params + salt for an email. Unknown emails get a stable fake salt, same shape. */
    async prelogin(email: string): Promise<PreloginResponse> {
      const user = await users.findByEmail(email);
      if (user) {
        return {
          kdf: {
            alg: "argon2id",
            memoryKiB: user.kdfMemoryKib,
            iterations: user.kdfIterations,
            parallelism: 1,
          },
          kdfSalt: user.kdfSalt,
        };
      }
      const fakeSalt = hmac(config.hmacKey, "prelogin-salt", email).subarray(0, 16);
      return { kdf: DEFAULT_KDF, kdfSalt: fakeSalt.toString("base64url") };
    },

    /**
     * Creates the account and emails a verification link. Answers the same
     * whether or not the email is taken (decisions §11.13).
     */
    async signup(input: SignupRequest, request: RequestMeta): Promise<void> {
      await deps.legal.assertSignupAcceptance(input.acceptedLegal);
      // Hash before the existence check, so both paths take as long.
      const [password, recoveryAuthHash] = await Promise.all([
        passwordColumns(input),
        hash(input.recoveryAuthKey),
      ]);

      const notifyExisting = () =>
        deps.email.send({
          to: input.email,
          template: "signup_existing",
          data: { loginLink: link("/login"), recoverLink: link("/recover") },
        });
      if (await users.findByEmail(input.email)) return notifyExisting();

      let user: Awaited<ReturnType<UsersService["create"]>>;
      try {
        user = await users.create({
          email: input.email,
          ...password,
          publicKey: input.publicKey,
          encryptedPrivateKey: input.encryptedPrivateKey,
          recoveryWrappedUserKey: input.recoveryWrappedUserKey,
          recoveryAuthHash,
          securityStamp: randomUUID(),
        });
      } catch (err) {
        if (isUniqueViolation(err)) return notifyExisting();
        throw err;
      }

      await audit.record({
        action: "auth.signup",
        actor: { userId: user.id },
        target: { type: "user", id: user.id },
        request,
      });
      await deps.legal.acceptAtSignup(user.id, input.acceptedLegal, request);
      await sendVerification(user.id, user.email);
    },

    async verifyEmail(token: string, request: RequestMeta): Promise<void> {
      const userId = await repo.consumeToken("email_verify", sha256Hex(token), now());
      if (!userId) throw badRequest("This link is invalid or has expired");
      if (await users.markEmailVerified(userId)) {
        await audit.record({
          action: "auth.email_verified",
          actor: { userId },
          target: { type: "user", id: userId },
          request,
        });
      }
    },

    /** Always succeeds from the caller's view; only unverified accounts get an email. */
    async resendVerification(email: string): Promise<void> {
      const user = await users.findByEmail(email);
      if (user && !user.emailVerifiedAt && user.status === "active") {
        await sendVerification(user.id, user.email);
      }
    },

    /**
     * Unknown email, wrong password and deactivated account all get the same
     * 401 after the same amount of work.
     */
    async login(input: LoginRequest, deviceToken: string | undefined, request: RequestMeta) {
      const user = await users.findByEmail(input.email);
      const ok = user
        ? await verifySecret(input.authKey, user.authHash)
        : await dummyVerify(input.authKey);

      if (!user || !ok || user.status !== "active") {
        const reason = !user ? "unknown_email" : !ok ? "wrong_password" : "deactivated";
        await audit.record({
          action: "auth.login_failed",
          ...(user ? { actor: { userId: user.id } } : {}),
          request,
          metadata: { reason, email: input.email },
        });
        throw unauthorized("Email or master password is incorrect");
      }
      if (!user.emailVerifiedAt) {
        throw new AppError(403, "EMAIL_NOT_VERIFIED", "Verify your email address first");
      }

      const tenant = userTenant(user.id);
      const device = await deps.devices.resolveForLogin({
        tenant,
        userId: user.id,
        deviceToken,
        userAgent: request.userAgent,
      });
      const state = await users.getState(user.id);
      const trusted = Boolean(state?.mfaEnabled) && deps.devices.isTrusted(device.device);
      const { token, session } = await sessions.create({
        userId: user.id,
        deviceId: device.device.id,
        securityStamp: user.securityStamp,
        mfaVerified: trusted,
        request,
      });

      await audit.record({
        action: "auth.login",
        actor: { userId: user.id, deviceId: device.device.id },
        target: { type: "session", id: session.id },
        request,
        metadata: { newDevice: device.isNew, trustedDevice: trusted },
      });
      if (device.isNew && !device.isFirst) {
        await deps.email.send({
          to: user.email,
          template: "new_device",
          data: { deviceName: device.device.name, ip: request.ip, at: now().toISOString() },
        });
      }

      return {
        sessionToken: token,
        deviceToken: device.deviceToken,
        session: await sessionResponse(user.id, session),
      };
    },

    async logout(actor: Actor, request: RequestMeta): Promise<void> {
      await sessions.revoke(actor.tenant, actor.sessionId);
      await audit.record({
        action: "auth.logout",
        actor: auditActor(actor),
        target: { type: "session", id: actor.sessionId },
        request,
      });
    },

    /**
     * New master password: same user key, re-wrapped on the device. Rotates
     * the security stamp and signs out every other session.
     */
    async changePassword(
      actor: Actor,
      session: SessionContext,
      input: ChangePasswordRequest,
      request: RequestMeta,
    ): Promise<void> {
      const user = await users.findById(actor.userId);
      if (!user || !(await verifySecret(input.currentAuthKey, user.authHash))) {
        await audit.record({
          action: "auth.password_change_failed",
          actor: auditActor(actor),
          request,
        });
        throw badRequest("Current master password is incorrect");
      }

      const stamp = randomUUID();
      await users.updatePassword(user.id, await passwordColumns(input.next), stamp);
      await sessions.setSecurityStamp(actor.tenant, session, stamp);
      const otherSessionsRevoked = await sessions.revokeAll(actor.tenant, {
        exceptSessionId: session.id,
      });

      await audit.record({
        action: "auth.password_changed",
        actor: auditActor(actor),
        target: { type: "user", id: user.id },
        request,
        metadata: { otherSessionsRevoked },
      });
      await deps.email.send({
        to: user.email,
        template: "password_changed",
        data: { at: now().toISOString() },
      });
    },

    /** New recovery kit (the old recovery key stops working). Needs the current password. */
    async rotateRecoveryKey(
      actor: Actor,
      input: RotateRecoveryKeyRequest,
      request: RequestMeta,
    ): Promise<void> {
      const user = await users.findById(actor.userId);
      if (!user || !(await verifySecret(input.authKey, user.authHash))) {
        throw badRequest("Master password is incorrect");
      }
      await users.updateRecovery(user.id, {
        recoveryWrappedUserKey: input.recoveryWrappedUserKey,
        recoveryAuthHash: await hash(input.recoveryAuthKey),
      });
      await audit.record({
        action: "auth.recovery_key_rotated",
        actor: auditActor(actor),
        target: { type: "user", id: user.id },
        request,
      });
      await deps.email.send({
        to: user.email,
        template: "recovery_key_changed",
        data: { at: now().toISOString() },
      });
    },

    /** Recovery step 1: prove the recovery key, get the user key wrapped by it. */
    async recoverStart(
      input: RecoverStartRequest,
      request: RequestMeta,
    ): Promise<RecoverStartResponse> {
      const user = await users.findByEmail(input.email);
      const ok = user
        ? await verifySecret(input.recoveryAuthKey, user.recoveryAuthHash)
        : await dummyVerify(input.recoveryAuthKey);
      if (!user || !ok || user.status !== "active") {
        await audit.record({
          action: "auth.recovery_failed",
          ...(user ? { actor: { userId: user.id } } : {}),
          request,
          metadata: { email: input.email },
        });
        throw unauthorized("Email or recovery key is incorrect");
      }
      const recoveryToken = await issueToken(user.id, "account_recovery", RECOVERY_TOKEN_TTL_MS);
      return { recoveryToken, recoveryWrappedUserKey: user.recoveryWrappedUserKey };
    },

    /**
     * Recovery step 2: new master password + new recovery key. Every session
     * is revoked and every device's MFA trust dropped, so MFA applies at the
     * next login on every browser (decisions §11.19, §14.1).
     */
    async recoverComplete(input: RecoverCompleteRequest, request: RequestMeta): Promise<void> {
      const userId = await repo.consumeToken(
        "account_recovery",
        sha256Hex(input.recoveryToken),
        now(),
      );
      if (!userId) throw badRequest("Recovery expired. Start again with your recovery key.");
      const user = await users.findById(userId);
      if (!user) throw badRequest("Recovery expired. Start again with your recovery key.");

      const stamp = randomUUID();
      await users.updatePasswordAndRecovery(
        user.id,
        await passwordColumns(input),
        {
          recoveryWrappedUserKey: input.recoveryWrappedUserKey,
          recoveryAuthHash: await hash(input.recoveryAuthKey),
        },
        stamp,
      );
      const tenant = userTenant(user.id);
      const sessionsRevoked = await sessions.revokeAll(tenant);
      const devicesUntrusted = await deps.devices.untrustAll(tenant);

      await audit.record({
        action: "auth.recovery_used",
        actor: { userId: user.id },
        target: { type: "user", id: user.id },
        request,
        metadata: { sessionsRevoked, devicesUntrusted },
      });
      await deps.email.send({
        to: user.email,
        template: "recovery_used",
        data: { at: now().toISOString() },
      });
    },

    /** Daily maintenance (auth.cleanup job). */
    async cleanup(): Promise<{ sessions: number; tokens: number }> {
      const before = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const [sessionsDeleted, tokens] = await Promise.all([
        sessions.cleanup(),
        repo.deleteExpiredTokens(before),
      ]);
      return { sessions: sessionsDeleted, tokens };
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
