// TOTP codes for vault items (RFC 6238 over RFC 4226 HOTP), so web,
// extension and mobile show the same code for the same secret. HMAC comes
// from WebCrypto because libsodium has no HMAC-SHA1. Doesn't need ready().
//
// Secrets are RFC 4648 base32 (what authenticator apps use), not the
// Crockford alphabet of recovery keys.
import { CryptoError } from "./errors";

export const TOTP_ALGORITHMS = ["SHA1", "SHA256", "SHA512"] as const;
export type TotpAlgorithm = (typeof TOTP_ALGORITHMS)[number];

export interface TotpParams {
  /** Base32 secret. Any case, spaces and `=` padding are accepted. */
  secret: string;
  algorithm: TotpAlgorithm;
  /** 6–8 */
  digits: number;
  /** Seconds per code. */
  period: number;
}

/** What authenticator apps assume when a parameter is missing. */
export const TOTP_DEFAULTS = { algorithm: "SHA1", digits: 6, period: 30 } as const;

export const TOTP_LIMITS = {
  digits: { min: 6, max: 8 },
  period: { min: 1, max: 300 },
  /** Decoded secret length. RFC 4226 wants ≥ 16, but some sites issue shorter ones. */
  secretBytes: { min: 1, max: 128 },
} as const;

const HASH: Record<TotpAlgorithm, string> = {
  SHA1: "SHA-1",
  SHA256: "SHA-256",
  SHA512: "SHA-512",
};

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** Uppercase, no spaces or padding. Throws if it isn't valid base32 of an allowed length. */
export function normalizeTotpSecret(secret: string): string {
  const normalized = secret.replace(/\s/g, "").replace(/=+$/, "").toUpperCase();
  decodeBase32(normalized);
  return normalized;
}

export function decodeBase32(text: string): Uint8Array<ArrayBuffer> {
  const chars = text.replace(/\s/g, "").replace(/=+$/, "").toUpperCase();
  // 1, 3 or 6 trailing characters can't come from whole bytes.
  if ([1, 3, 6].includes(chars.length % 8)) throw new CryptoError("invalid base32 length");
  const out = new Uint8Array(Math.floor((chars.length * 5) / 8));
  let buffer = 0;
  let bits = 0;
  let i = 0;
  for (const ch of chars) {
    const value = BASE32.indexOf(ch);
    if (value < 0) throw new CryptoError("invalid base32 character");
    buffer = ((buffer << 5) | value) & 0xffff;
    bits += 5;
    if (bits >= 8) {
      out[i++] = (buffer >> (bits - 8)) & 255;
      bits -= 8;
    }
  }
  const { min, max } = TOTP_LIMITS.secretBytes;
  if (out.length < min || out.length > max) {
    throw new CryptoError(`TOTP secret must be ${min}–${max} bytes`);
  }
  return out;
}

export function assertTotpParams(params: TotpParams): void {
  if (!TOTP_ALGORITHMS.includes(params.algorithm)) {
    throw new CryptoError(`unsupported TOTP algorithm "${params.algorithm}"`);
  }
  for (const name of ["digits", "period"] as const) {
    const value = params[name];
    const { min, max } = TOTP_LIMITS[name];
    if (!Number.isInteger(value) || value < min || value > max) {
      throw new CryptoError(`TOTP ${name} must be an integer in [${min}, ${max}]`);
    }
  }
}

/** RFC 4226 HOTP: HMAC of the 8-byte big-endian counter, dynamic truncation. */
async function hotp(
  key: Uint8Array<ArrayBuffer>,
  counter: number,
  algorithm: TotpAlgorithm,
  digits: number,
): Promise<string> {
  const message = new Uint8Array(8);
  const view = new DataView(message.buffer);
  view.setUint32(0, Math.floor(counter / 2 ** 32));
  view.setUint32(4, counter >>> 0);
  const hmacKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: HASH[algorithm] },
    false,
    ["sign"],
  );
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", hmacKey, message));
  const offset = (mac[mac.length - 1] ?? 0) & 0x0f;
  const binary = new DataView(mac.buffer).getUint32(offset) & 0x7fffffff;
  return String(binary % 10 ** digits).padStart(digits, "0");
}

/** The code valid at `atMs` (Unix ms, default now). */
export async function totpCode(params: TotpParams, atMs: number = Date.now()): Promise<string> {
  assertTotpParams(params);
  const key = decodeBase32(params.secret);
  try {
    return await hotp(
      key,
      Math.floor(atMs / 1000 / params.period),
      params.algorithm,
      params.digits,
    );
  } finally {
    key.fill(0);
  }
}

/** Whole seconds until the code shown at `atMs` changes (1…period). */
export function totpSecondsRemaining(period: number, atMs: number = Date.now()): number {
  return period - (Math.floor(atMs / 1000) % period);
}
