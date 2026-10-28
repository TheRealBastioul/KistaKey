import {
  ChangePasswordRequestSchema,
  type CsrfResponse,
  LoginRequestSchema,
  MfaVerifyCodeRequestSchema,
  type OkResponse,
  PreloginRequestSchema,
  type PreloginResponse,
  RecoverCompleteRequestSchema,
  RecoverStartRequestSchema,
  type RecoverStartResponse,
  ResendVerificationRequestSchema,
  RotateRecoveryKeyRequestSchema,
  type SessionResponse,
  SignupRequestSchema,
  type SignupResponse,
  VerifyEmailRequestSchema,
  type WebAuthnOptionsResponse,
  WebAuthnVerifyRequestSchema,
} from "@repo/types";
import type { FastifyPluginAsync } from "fastify";
import {
  DEVICE_COOKIE_MAX_AGE_MS,
  SESSION_ABSOLUTE_MS,
  type SecurityConfig,
} from "../../config/security";
import { clearCookie, cookieNames, cookieOptions, requestMeta } from "../../lib/http";
import { actorOf, requireAuth } from "../../plugins/auth";
import { issueCsrfToken } from "../../plugins/csrf";
import { byEmail, byIp, byUser, rateLimits } from "../../plugins/rate-limit";
import type { MfaService } from "../mfa";
import type { AuthService } from "./auth.service";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const PUBLIC = { auth: "public" as const };
/** Reachable in every gate state (the client needs them to get out of one). */
const ANY_STEP = { auth: { allow: ["mfa" as const, "legal" as const, "mfa_setup" as const] } };
const MFA_STEP = { auth: { allow: ["mfa" as const] } };
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function authRoutes(
  auth: AuthService,
  mfa: MfaService,
  config: SecurityConfig,
): FastifyPluginAsync {
  const names = cookieNames(config.cookieSecure);

  return async (app) => {
    app.get("/auth/csrf", { config: PUBLIC }, async (req, reply): Promise<CsrfResponse> => {
      return { token: issueCsrfToken(req, reply, config) };
    });

    app.post(
      "/auth/prelogin",
      {
        config: PUBLIC,
        preHandler: rateLimits(app, [
          { name: "prelogin-ip", max: 30, windowMs: MINUTE, key: byIp },
          { name: "prelogin-email", max: 10, windowMs: MINUTE, key: byEmail },
        ]),
      },
      async (req): Promise<PreloginResponse> => {
        const { email } = PreloginRequestSchema.parse(req.body);
        return auth.prelogin(email);
      },
    );

    app.post(
      "/auth/signup",
      {
        config: PUBLIC,
        preHandler: rateLimits(app, [
          { name: "signup-ip", max: 10, windowMs: HOUR, key: byIp },
          { name: "signup-email", max: 3, windowMs: HOUR, key: byEmail },
        ]),
      },
      async (req): Promise<SignupResponse> => {
        await auth.signup(SignupRequestSchema.parse(req.body), requestMeta(req));
        return { status: "verification_sent" };
      },
    );

    app.post(
      "/auth/verify-email",
      {
        config: PUBLIC,
        preHandler: rateLimits(app, [{ name: "verify-ip", max: 20, windowMs: MINUTE, key: byIp }]),
      },
      async (req): Promise<OkResponse> => {
        const { token } = VerifyEmailRequestSchema.parse(req.body);
        await auth.verifyEmail(token, requestMeta(req));
        return { ok: true };
      },
    );

    app.post(
      "/auth/verify-email/resend",
      {
        config: PUBLIC,
        preHandler: rateLimits(app, [
          { name: "resend-ip", max: 10, windowMs: HOUR, key: byIp },
          { name: "resend-email", max: 3, windowMs: HOUR, key: byEmail },
        ]),
      },
      async (req): Promise<OkResponse> => {
        const { email } = ResendVerificationRequestSchema.parse(req.body);
        await auth.resendVerification(email);
        return { ok: true };
      },
    );

    app.post(
      "/auth/login",
      {
        config: PUBLIC,
        preHandler: rateLimits(app, [
          { name: "login-ip", max: 10, windowMs: MINUTE, key: byIp },
          { name: "login-email", max: 10, windowMs: 15 * MINUTE, key: byEmail },
        ]),
      },
      async (req, reply): Promise<SessionResponse> => {
        const body = LoginRequestSchema.parse(req.body);
        const cookie = req.cookies[names.device];
        const deviceToken = cookie && TOKEN_PATTERN.test(cookie) ? cookie : undefined;
        const result = await auth.login(body, deviceToken, requestMeta(req));
        reply.setCookie(
          names.session,
          result.sessionToken,
          cookieOptions(config.cookieSecure, SESSION_ABSOLUTE_MS),
        );
        reply.setCookie(
          names.device,
          result.deviceToken,
          cookieOptions(config.cookieSecure, DEVICE_COOKIE_MAX_AGE_MS),
        );
        return result.session;
      },
    );

    app.get("/auth/session", { config: ANY_STEP }, async (req): Promise<SessionResponse> => {
      const ctx = requireAuth(req);
      return auth.sessionResponse(ctx.user.id, ctx.session);
    });

    app.post("/auth/logout", { config: ANY_STEP }, async (req, reply): Promise<OkResponse> => {
      await auth.logout(actorOf(req), requestMeta(req));
      clearCookie(reply, names.session, config.cookieSecure);
      return { ok: true };
    });

    // --- Second factor at login

    const mfaLimit = rateLimits(app, [
      { name: "mfa-user", max: 10, windowMs: 5 * MINUTE, key: byUser },
      { name: "mfa-ip", max: 30, windowMs: 5 * MINUTE, key: byIp },
    ]);

    app.post(
      "/auth/mfa/totp",
      { config: MFA_STEP, preHandler: mfaLimit },
      async (req): Promise<SessionResponse> => {
        const body = MfaVerifyCodeRequestSchema.parse(req.body);
        const ctx = requireAuth(req);
        await mfa.verifyCode(actorOf(req), ctx.session, body, requestMeta(req));
        return auth.sessionResponse(ctx.user.id, { ...ctx.session, mfaVerified: true });
      },
    );

    app.post(
      "/auth/mfa/webauthn/options",
      { config: MFA_STEP, preHandler: mfaLimit },
      async (req): Promise<WebAuthnOptionsResponse> => {
        const options = await mfa.webauthnAuthOptions(actorOf(req), requireAuth(req).session);
        return { options: { ...options } };
      },
    );

    app.post(
      "/auth/mfa/webauthn/verify",
      { config: MFA_STEP, preHandler: mfaLimit },
      async (req): Promise<SessionResponse> => {
        const body = WebAuthnVerifyRequestSchema.parse(req.body);
        const ctx = requireAuth(req);
        await mfa.webauthnAuthVerify(actorOf(req), ctx.session, body, requestMeta(req));
        return auth.sessionResponse(ctx.user.id, { ...ctx.session, mfaVerified: true });
      },
    );

    // --- Signed-in account changes

    const sensitiveLimit = rateLimits(app, [
      { name: "account-user", max: 5, windowMs: 15 * MINUTE, key: byUser },
    ]);

    app.post("/me/password", { preHandler: sensitiveLimit }, async (req): Promise<OkResponse> => {
      const body = ChangePasswordRequestSchema.parse(req.body);
      await auth.changePassword(actorOf(req), requireAuth(req).session, body, requestMeta(req));
      return { ok: true };
    });

    app.post(
      "/me/recovery-key",
      { preHandler: sensitiveLimit },
      async (req): Promise<OkResponse> => {
        const body = RotateRecoveryKeyRequestSchema.parse(req.body);
        await auth.rotateRecoveryKey(actorOf(req), body, requestMeta(req));
        return { ok: true };
      },
    );

    // --- Account recovery (signed out)

    app.post(
      "/auth/recover/start",
      {
        config: PUBLIC,
        preHandler: rateLimits(app, [
          { name: "recover-ip", max: 10, windowMs: HOUR, key: byIp },
          { name: "recover-email", max: 5, windowMs: HOUR, key: byEmail },
        ]),
      },
      async (req): Promise<RecoverStartResponse> => {
        return auth.recoverStart(RecoverStartRequestSchema.parse(req.body), requestMeta(req));
      },
    );

    app.post(
      "/auth/recover/complete",
      {
        config: PUBLIC,
        preHandler: rateLimits(app, [
          { name: "recover-complete-ip", max: 10, windowMs: HOUR, key: byIp },
        ]),
      },
      async (req, reply): Promise<OkResponse> => {
        await auth.recoverComplete(RecoverCompleteRequestSchema.parse(req.body), requestMeta(req));
        clearCookie(reply, names.session, config.cookieSecure);
        return { ok: true };
      },
    );
  };
}
