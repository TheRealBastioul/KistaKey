// Second factor: TOTP, WebAuthn (security keys / platform authenticators)
// and one-time recovery codes.
import { z } from "zod";
import { IsoDateSchema } from "./common";

export const TotpCodeSchema = z.string().regex(/^\d{6}$/, "expected a 6-digit code");

/** Recovery codes are shown as xxxxx-xxxxx (Crockford base32); input is forgiving. */
export const RecoveryCodeSchema = z
  .string()
  .trim()
  .max(32)
  .regex(/^[0-9A-Za-z -]+$/, "expected a recovery code");

/** POST /me/mfa/totp/setup: the secret is shown once, until confirmed. */
export const TotpSetupResponseSchema = z.object({
  secret: z.string(),
  otpauthUri: z.string(),
});
export type TotpSetupResponse = z.infer<typeof TotpSetupResponseSchema>;

/** POST /me/mfa/totp/confirm */
export const TotpConfirmRequestSchema = z.object({ code: TotpCodeSchema });
export type TotpConfirmRequest = z.infer<typeof TotpConfirmRequestSchema>;

/** Returned when a first MFA method is added (codes are issued then) or codes are regenerated. */
export const RecoveryCodesResponseSchema = z.object({
  recoveryCodes: z.array(z.string()),
});
export type RecoveryCodesResponse = z.infer<typeof RecoveryCodesResponseSchema>;

/** Confirm/register response: recovery codes only if this was the first method. */
export const MfaEnrollResponseSchema = z.object({
  recoveryCodes: z.array(z.string()).nullable(),
});
export type MfaEnrollResponse = z.infer<typeof MfaEnrollResponseSchema>;

/** POST /auth/mfa/totp: a TOTP code or a recovery code. */
export const MfaVerifyCodeRequestSchema = z.discriminatedUnion("method", [
  z.object({ method: z.literal("totp"), code: TotpCodeSchema, trustDevice: z.boolean() }),
  z.object({
    method: z.literal("recovery_code"),
    code: RecoveryCodeSchema,
    trustDevice: z.boolean(),
  }),
]);
export type MfaVerifyCodeRequest = z.infer<typeof MfaVerifyCodeRequestSchema>;

/**
 * WebAuthn options/responses are the JSON shapes from @simplewebauthn
 * (PublicKeyCredential*OptionsJSON / *ResponseJSON). They're validated by
 * @simplewebauthn/server, so here they're opaque objects.
 */
const WebAuthnJsonSchema = z.record(z.string(), z.unknown());

export const WebAuthnOptionsResponseSchema = z.object({ options: WebAuthnJsonSchema });
export type WebAuthnOptionsResponse = z.infer<typeof WebAuthnOptionsResponseSchema>;

/** POST /auth/mfa/webauthn/verify */
export const WebAuthnVerifyRequestSchema = z.object({
  response: WebAuthnJsonSchema,
  trustDevice: z.boolean(),
});
export type WebAuthnVerifyRequest = z.infer<typeof WebAuthnVerifyRequestSchema>;

/** POST /me/mfa/webauthn/register/verify */
export const WebAuthnRegisterRequestSchema = z.object({
  response: WebAuthnJsonSchema,
  name: z.string().trim().min(1).max(64),
});
export type WebAuthnRegisterRequest = z.infer<typeof WebAuthnRegisterRequestSchema>;

export const WebAuthnCredentialSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  createdAt: IsoDateSchema,
  lastUsedAt: IsoDateSchema.nullable(),
});
export type WebAuthnCredential = z.infer<typeof WebAuthnCredentialSchema>;

/** GET /me/mfa */
export const MfaOverviewResponseSchema = z.object({
  totp: z.object({ enabled: z.boolean(), confirmedAt: IsoDateSchema.nullable() }),
  webauthn: z.array(WebAuthnCredentialSchema),
  recoveryCodesRemaining: z.number().int().min(0),
});
export type MfaOverviewResponse = z.infer<typeof MfaOverviewResponseSchema>;
