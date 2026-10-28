// Typed calls for the accounts endpoints (Phase 2 API). Responses are parsed with the
// shared @repo/types schemas, so a contract drift fails loudly here.
import {
  type ChangePasswordRequest,
  DeviceListResponseSchema,
  type LegalAcceptance,
  LegalCurrentResponseSchema,
  MfaEnrollResponseSchema,
  MfaOverviewResponseSchema,
  type MfaVerifyCodeRequest,
  OkResponseSchema,
  PreloginResponseSchema,
  type RecoverCompleteRequest,
  RecoverStartResponseSchema,
  RecoveryCodesResponseSchema,
  type RotateRecoveryKeyRequest,
  SessionListResponseSchema,
  SessionResponseSchema,
  type SignupRequest,
  SignupResponseSchema,
  TotpSetupResponseSchema,
  WebAuthnOptionsResponseSchema,
} from "@repo/types";
import { request } from "./client";

const PUBLIC = { public: true } as const;

export const authApi = {
  session: () => request("GET", "/auth/session", { schema: SessionResponseSchema }),

  prelogin: (email: string) =>
    request("POST", "/auth/prelogin", {
      ...PUBLIC,
      body: { email },
      schema: PreloginResponseSchema,
    }),

  login: (email: string, authKey: string) =>
    request("POST", "/auth/login", {
      ...PUBLIC,
      body: { email, authKey },
      schema: SessionResponseSchema,
    }),

  logout: () => request("POST", "/auth/logout", { schema: OkResponseSchema }),

  signup: (body: SignupRequest) =>
    request("POST", "/auth/signup", { ...PUBLIC, body, schema: SignupResponseSchema }),

  verifyEmail: (token: string) =>
    request("POST", "/auth/verify-email", { ...PUBLIC, body: { token }, schema: OkResponseSchema }),

  resendVerification: (email: string) =>
    request("POST", "/auth/verify-email/resend", {
      ...PUBLIC,
      body: { email },
      schema: OkResponseSchema,
    }),

  recoverStart: (email: string, recoveryAuthKey: string) =>
    request("POST", "/auth/recover/start", {
      ...PUBLIC,
      body: { email, recoveryAuthKey },
      schema: RecoverStartResponseSchema,
    }),

  recoverComplete: (body: RecoverCompleteRequest) =>
    request("POST", "/auth/recover/complete", { ...PUBLIC, body, schema: OkResponseSchema }),

  changePassword: (body: ChangePasswordRequest) =>
    request("POST", "/me/password", { body, schema: OkResponseSchema }),

  rotateRecoveryKey: (body: RotateRecoveryKeyRequest) =>
    request("POST", "/me/recovery-key", { body, schema: OkResponseSchema }),
};

export const mfaApi = {
  verifyCode: (body: MfaVerifyCodeRequest) =>
    request("POST", "/auth/mfa/totp", { body, schema: SessionResponseSchema }),

  webauthnOptions: () =>
    request("POST", "/auth/mfa/webauthn/options", { schema: WebAuthnOptionsResponseSchema }),

  webauthnVerify: (response: Record<string, unknown>, trustDevice: boolean) =>
    request("POST", "/auth/mfa/webauthn/verify", {
      body: { response, trustDevice },
      schema: SessionResponseSchema,
    }),

  overview: () => request("GET", "/me/mfa", { schema: MfaOverviewResponseSchema }),

  totpSetup: () => request("POST", "/me/mfa/totp/setup", { schema: TotpSetupResponseSchema }),

  totpConfirm: (code: string) =>
    request("POST", "/me/mfa/totp/confirm", { body: { code }, schema: MfaEnrollResponseSchema }),

  totpRemove: () => request("DELETE", "/me/mfa/totp", { schema: OkResponseSchema }),

  webauthnRegisterOptions: () =>
    request("POST", "/me/mfa/webauthn/register/options", {
      schema: WebAuthnOptionsResponseSchema,
    }),

  webauthnRegisterVerify: (response: Record<string, unknown>, name: string) =>
    request("POST", "/me/mfa/webauthn/register/verify", {
      body: { response, name },
      schema: MfaEnrollResponseSchema,
    }),

  webauthnRemove: (id: string) =>
    request("DELETE", `/me/mfa/webauthn/${id}`, { schema: OkResponseSchema }),

  regenerateRecoveryCodes: () =>
    request("POST", "/me/mfa/recovery-codes", { schema: RecoveryCodesResponseSchema }),
};

export const devicesApi = {
  devices: () => request("GET", "/me/devices", { schema: DeviceListResponseSchema }),
  revokeDevice: (id: string) =>
    request("DELETE", `/me/devices/${id}`, { schema: OkResponseSchema }),
  sessions: () => request("GET", "/me/sessions", { schema: SessionListResponseSchema }),
  revokeSession: (id: string) =>
    request("DELETE", `/me/sessions/${id}`, { schema: OkResponseSchema }),
};

export const legalApi = {
  current: () =>
    request("GET", "/legal/current", { ...PUBLIC, schema: LegalCurrentResponseSchema }),
  accept: (accepted: LegalAcceptance[]) =>
    request("POST", "/me/legal/accept", { body: { accepted }, schema: OkResponseSchema }),
};
