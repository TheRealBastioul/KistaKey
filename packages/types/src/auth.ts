// Accounts, sessions, password change and recovery. The server only ever
// sees authKey / recoveryAuthKey (which it hashes again) and encrypted key
// material produced by @repo/crypto. ref/decisions.md §11.
import { z } from "zod";
import { EmailSchema, EncryptedBlobSchema, Key32Schema, Salt16Schema, TokenSchema } from "./common";
import { LegalAcceptanceSchema, PendingLegalSchema } from "./legal";

/** Same bounds as @repo/crypto's KDF_LIMITS, so the server never stores params clients refuse. */
export const KdfParamsSchema = z.object({
  alg: z.literal("argon2id"),
  memoryKiB: z
    .number()
    .int()
    .min(19 * 1024)
    .max(1024 * 1024),
  iterations: z.number().int().min(2).max(10),
  parallelism: z.literal(1),
});
export type KdfParams = z.infer<typeof KdfParamsSchema>;

/** POST /auth/prelogin */
export const PreloginRequestSchema = z.object({ email: EmailSchema });
export type PreloginRequest = z.infer<typeof PreloginRequestSchema>;

/** Same shape (and a stable fake salt) for emails without an account. */
export const PreloginResponseSchema = z.object({
  kdf: KdfParamsSchema,
  kdfSalt: Salt16Schema,
});
export type PreloginResponse = z.infer<typeof PreloginResponseSchema>;

/** The password-derived part of an account: set at signup, password change and recovery. */
export const PasswordMaterialSchema = z.object({
  authKey: Key32Schema,
  kdf: KdfParamsSchema,
  kdfSalt: Salt16Schema,
  encryptedUserKey: EncryptedBlobSchema,
});
export type PasswordMaterial = z.infer<typeof PasswordMaterialSchema>;

export const RecoveryMaterialSchema = z.object({
  recoveryWrappedUserKey: EncryptedBlobSchema,
  recoveryAuthKey: Key32Schema,
});
export type RecoveryMaterial = z.infer<typeof RecoveryMaterialSchema>;

/** POST /auth/signup */
export const SignupRequestSchema = PasswordMaterialSchema.extend(
  RecoveryMaterialSchema.shape,
).extend({
  email: EmailSchema,
  publicKey: Key32Schema,
  encryptedPrivateKey: EncryptedBlobSchema,
  acceptedLegal: z.array(LegalAcceptanceSchema).min(1).max(10),
});
export type SignupRequest = z.infer<typeof SignupRequestSchema>;

/**
 * Always this, whether or not the email already had an account (so signup
 * can't be used to discover accounts). Signup doesn't log in.
 */
export const SignupResponseSchema = z.object({ status: z.literal("verification_sent") });
export type SignupResponse = z.infer<typeof SignupResponseSchema>;

/** POST /auth/verify-email */
export const VerifyEmailRequestSchema = z.object({ token: TokenSchema });
export type VerifyEmailRequest = z.infer<typeof VerifyEmailRequestSchema>;

/** POST /auth/verify-email/resend: always 200. */
export const ResendVerificationRequestSchema = z.object({ email: EmailSchema });
export type ResendVerificationRequest = z.infer<typeof ResendVerificationRequestSchema>;

/** POST /auth/login */
export const LoginRequestSchema = z.object({
  email: EmailSchema,
  authKey: Key32Schema,
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const MfaMethodSchema = z.enum(["totp", "webauthn", "recovery_code"]);
export type MfaMethod = z.infer<typeof MfaMethodSchema>;

/**
 * What the session needs next, in gate order:
 * mfa (verify the second factor) → legal (accept documents) →
 * mfa_setup (add a first method) → ready.
 */
export const SessionStepSchema = z.enum(["mfa", "legal", "mfa_setup", "ready"]);
export type SessionStep = z.infer<typeof SessionStepSchema>;

/** Key material for unlocking on the device. Only sent once the session is `ready`. */
export const SessionKeysSchema = z.object({
  kdf: KdfParamsSchema,
  kdfSalt: Salt16Schema,
  encryptedUserKey: EncryptedBlobSchema,
  publicKey: Key32Schema,
  encryptedPrivateKey: EncryptedBlobSchema,
});
export type SessionKeys = z.infer<typeof SessionKeysSchema>;

/** GET /auth/session, and the body of login / MFA verify / legal accept. */
export const SessionResponseSchema = z.object({
  step: SessionStepSchema,
  user: z.object({
    id: z.uuid(),
    email: z.string(),
    emailVerified: z.boolean(),
  }),
  /** Second-factor methods this user can be challenged with. */
  mfaMethods: z.array(MfaMethodSchema),
  pendingLegal: z.array(PendingLegalSchema),
  keys: SessionKeysSchema.nullable(),
});
export type SessionResponse = z.infer<typeof SessionResponseSchema>;

/** POST /me/password */
export const ChangePasswordRequestSchema = z.object({
  currentAuthKey: Key32Schema,
  next: PasswordMaterialSchema,
});
export type ChangePasswordRequest = z.infer<typeof ChangePasswordRequestSchema>;

/** POST /me/recovery-key: new recovery kit. Needs the current password's authKey. */
export const RotateRecoveryKeyRequestSchema = RecoveryMaterialSchema.extend({
  authKey: Key32Schema,
});
export type RotateRecoveryKeyRequest = z.infer<typeof RotateRecoveryKeyRequestSchema>;

/** POST /auth/recover/start */
export const RecoverStartRequestSchema = z.object({
  email: EmailSchema,
  recoveryAuthKey: Key32Schema,
});
export type RecoverStartRequest = z.infer<typeof RecoverStartRequestSchema>;

export const RecoverStartResponseSchema = z.object({
  /** Short-lived, single-use; authorizes /auth/recover/complete. */
  recoveryToken: TokenSchema,
  recoveryWrappedUserKey: EncryptedBlobSchema,
});
export type RecoverStartResponse = z.infer<typeof RecoverStartResponseSchema>;

/** POST /auth/recover/complete: new password + new recovery key. Revokes every session. */
export const RecoverCompleteRequestSchema = PasswordMaterialSchema.extend(
  RecoveryMaterialSchema.shape,
).extend({ recoveryToken: TokenSchema });
export type RecoverCompleteRequest = z.infer<typeof RecoverCompleteRequestSchema>;

/** GET /auth/csrf */
export const CsrfResponseSchema = z.object({ token: z.string() });
export type CsrfResponse = z.infer<typeof CsrfResponseSchema>;
