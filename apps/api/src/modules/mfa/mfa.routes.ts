// Settings → two-step login. The login-time challenge routes
// (/auth/mfa/*) are in the auth module, because they answer with the
// session state. Enrollment routes are reachable before MFA is set up
// (the forced setup after signup).
import {
  IdParamsSchema,
  type MfaEnrollResponse,
  type MfaOverviewResponse,
  type OkResponse,
  type RecoveryCodesResponse,
  TotpConfirmRequestSchema,
  type TotpSetupResponse,
  type WebAuthnOptionsResponse,
  WebAuthnRegisterRequestSchema,
} from "@repo/types";
import type { FastifyPluginAsync } from "fastify";
import { requestMeta } from "../../lib/http";
import { actorOf, requireAuth } from "../../plugins/auth";
import type { MfaService } from "./mfa.service";

const SETUP = { auth: { allow: ["mfa_setup" as const] } };

export function mfaRoutes(mfa: MfaService): FastifyPluginAsync {
  return async (app) => {
    app.get("/me/mfa", { config: SETUP }, async (req): Promise<MfaOverviewResponse> => {
      return mfa.overview(actorOf(req));
    });

    app.post("/me/mfa/totp/setup", { config: SETUP }, async (req): Promise<TotpSetupResponse> => {
      return mfa.totpSetup(actorOf(req), requireAuth(req).user.email);
    });

    app.post("/me/mfa/totp/confirm", { config: SETUP }, async (req): Promise<MfaEnrollResponse> => {
      const { code } = TotpConfirmRequestSchema.parse(req.body);
      const auth = requireAuth(req);
      const recoveryCodes = await mfa.totpConfirm(
        actorOf(req),
        auth.session,
        code,
        requestMeta(req),
      );
      return { recoveryCodes };
    });

    app.delete("/me/mfa/totp", async (req): Promise<OkResponse> => {
      await mfa.totpDisable(actorOf(req), requireAuth(req).user.email, requestMeta(req));
      return { ok: true };
    });

    app.post(
      "/me/mfa/webauthn/register/options",
      { config: SETUP },
      async (req): Promise<WebAuthnOptionsResponse> => {
        const auth = requireAuth(req);
        const options = await mfa.webauthnRegisterOptions(
          actorOf(req),
          auth.session,
          auth.user.email,
        );
        return { options: { ...options } };
      },
    );

    app.post(
      "/me/mfa/webauthn/register/verify",
      { config: SETUP },
      async (req): Promise<MfaEnrollResponse> => {
        const body = WebAuthnRegisterRequestSchema.parse(req.body);
        const auth = requireAuth(req);
        const recoveryCodes = await mfa.webauthnRegisterVerify(
          actorOf(req),
          auth.session,
          body,
          requestMeta(req),
        );
        return { recoveryCodes };
      },
    );

    app.delete("/me/mfa/webauthn/:id", async (req): Promise<OkResponse> => {
      const { id } = IdParamsSchema.parse(req.params);
      await mfa.webauthnRemove(actorOf(req), id, requireAuth(req).user.email, requestMeta(req));
      return { ok: true };
    });

    app.post("/me/mfa/recovery-codes", async (req): Promise<RecoveryCodesResponse> => {
      return { recoveryCodes: await mfa.regenerateRecoveryCodes(actorOf(req), requestMeta(req)) };
    });
  };
}
