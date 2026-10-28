// Security settings handed to the auth modules. Built from env in the entry
// points, and directly in tests (no env import here).
import { DEFAULT_SECRET_HASH_PARAMS, type SecretHashParams } from "../lib/secrets";

export interface SecurityConfig {
  /** Web app origin, e.g. https://app.example.com (WebAuthn origin, email links). */
  appOrigin: string;
  /** WebAuthn relying-party ID: the app origin's hostname. */
  rpId: string;
  /** Secure (+ __Host- prefixed) cookies. Off only for plain-http local dev. */
  cookieSecure: boolean;
  /** 32 bytes: AES-256-GCM for TOTP seeds. */
  encryptionKey: Buffer;
  /** ≥ 32 bytes: fake prelogin salts, MFA recovery code hashes. */
  hmacKey: Buffer;
  /** Server-side Argon2id for authKey / recoveryAuthKey. Tests lower it. */
  secretHash: SecretHashParams;
}

export function createSecurityConfig(input: {
  appOrigin: string;
  encryptionKey: Buffer;
  hmacKey: Buffer;
  secretHash?: SecretHashParams;
}): SecurityConfig {
  const origin = new URL(input.appOrigin);
  return {
    appOrigin: origin.origin,
    rpId: origin.hostname,
    cookieSecure: origin.protocol === "https:",
    encryptionKey: input.encryptionKey,
    hmacKey: input.hmacKey,
    secretHash: input.secretHash ?? DEFAULT_SECRET_HASH_PARAMS,
  };
}

/** Session lifetime (decisions §11.7). */
export const SESSION_IDLE_MS = 30 * 60 * 1000;
export const SESSION_ABSOLUTE_MS = 30 * 24 * 60 * 60 * 1000;
/** Trusted device skips the MFA prompt this long. */
export const DEVICE_TRUST_MS = 30 * 24 * 60 * 60 * 1000;
/** Device cookie lifetime: browsers cap cookies at 400 days. */
export const DEVICE_COOKIE_MAX_AGE_MS = 400 * 24 * 60 * 60 * 1000;
export const EMAIL_VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
export const RECOVERY_TOKEN_TTL_MS = 15 * 60 * 1000;
