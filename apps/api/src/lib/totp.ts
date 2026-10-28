// TOTP (RFC 6238 over RFC 4226 HOTP): HMAC-SHA1, 6 digits, 30 s steps,
// which is what every authenticator app supports. Checked against the RFC
// 6238 test vectors in totp.test.ts.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const TOTP_STEP_SECONDS = 30;
export const TOTP_DIGITS = 6;
/** Accept the previous and next step too, for clock drift. */
export const TOTP_WINDOW = 1;

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(bytes: Uint8Array): string {
  let out = "";
  let buffer = 0;
  let bits = 0;
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32.charAt((buffer >> (bits - 5)) & 31);
      bits -= 5;
    }
    buffer &= (1 << bits) - 1;
  }
  if (bits > 0) out += BASE32.charAt((buffer << (5 - bits)) & 31);
  return out;
}

export function base32Decode(text: string): Buffer {
  const clean = text.toUpperCase().replace(/[\s=]/g, "");
  const out: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const ch of clean) {
    const value = BASE32.indexOf(ch);
    if (value < 0) throw new Error("invalid base32");
    buffer = (buffer << 5) | value;
    bits += 5;
    if (bits >= 8) {
      out.push((buffer >> (bits - 8)) & 255);
      bits -= 8;
      buffer &= (1 << bits) - 1;
    }
  }
  return Buffer.from(out);
}

/** 160-bit secret (RFC 4226 recommends ≥ 128, SHA-1's block size is ideal), base32. */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function hotp(key: Buffer, counter: number, digits = TOTP_DIGITS): string {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", key).update(message).digest();
  const offset = (digest[digest.length - 1] ?? 0) & 0x0f;
  const binary = digest.readUInt32BE(offset) & 0x7fffffff;
  return String(binary % 10 ** digits).padStart(digits, "0");
}

export function totpStep(nowMs: number): number {
  return Math.floor(nowMs / 1000 / TOTP_STEP_SECONDS);
}

/**
 * Returns the matched step if `code` is valid within ±TOTP_WINDOW and newer
 * than `lastUsedStep` (so a code, or an older one, can't be replayed), else null.
 */
export function verifyTotp(
  secret: string,
  code: string,
  opts: { nowMs: number; lastUsedStep: number | null },
): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const key = base32Decode(secret);
  const current = totpStep(opts.nowMs);
  let matched: number | null = null;
  // Check every candidate (no early exit) so timing doesn't reveal which matched.
  for (let step = current - TOTP_WINDOW; step <= current + TOTP_WINDOW; step++) {
    const ok = timingSafeEqual(Buffer.from(hotp(key, step)), Buffer.from(code));
    if (ok && (opts.lastUsedStep === null || step > opts.lastUsedStep)) matched = step;
  }
  return matched;
}

export function otpauthUri(opts: { issuer: string; account: string; secret: string }): string {
  const label = encodeURIComponent(`${opts.issuer}:${opts.account}`);
  const params = new URLSearchParams({
    secret: opts.secret,
    issuer: opts.issuer,
    algorithm: "SHA1",
    digits: String(TOTP_DIGITS),
    period: String(TOTP_STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
