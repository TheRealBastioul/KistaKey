// Recovery key: 32 random bytes, shown once at signup as Crockford base32
// in groups of 4 (e.g. "7G2K-0QXM-..."). It wraps the user key a second time
// and derives the recoveryAuthKey the server checks. ref/decisions.md §11.6.
import { CryptoError } from "./errors";
import { hkdfSha256, KEY_BYTES } from "./kdf";
import { lib } from "./sodium";

/** Crockford base32: no I, L, O, U, so it survives being read aloud or handwritten. */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const GROUP = 4;
/** ceil(256 / 5) */
export const RECOVERY_KEY_CHARS = 52;

export function generateRecoveryKey(): Uint8Array {
  return lib().randombytes_buf(KEY_BYTES);
}

export function formatRecoveryKey(key: Uint8Array): string {
  if (key.length !== KEY_BYTES) throw new CryptoError("recovery key must be 32 bytes");
  let chars = "";
  let buffer = 0;
  let bits = 0;
  for (const byte of key) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      chars += ALPHABET.charAt((buffer >> (bits - 5)) & 31);
      bits -= 5;
    }
    buffer &= (1 << bits) - 1;
  }
  if (bits > 0) chars += ALPHABET.charAt((buffer << (5 - bits)) & 31);
  return chars.match(new RegExp(`.{1,${GROUP}}`, "g"))?.join("-") ?? "";
}

/**
 * Accepts what a user might type: any case, spaces or dashes anywhere, and
 * the usual look-alikes (O→0, I/L→1).
 */
export function parseRecoveryKey(text: string): Uint8Array {
  const chars = text.toUpperCase().replace(/[\s-]/g, "").replaceAll("O", "0").replace(/[IL]/g, "1");
  if (chars.length !== RECOVERY_KEY_CHARS) {
    throw new CryptoError(`recovery key must be ${RECOVERY_KEY_CHARS} characters`);
  }
  const out = new Uint8Array(KEY_BYTES);
  let buffer = 0;
  let bits = 0;
  let i = 0;
  for (const ch of chars) {
    const value = ALPHABET.indexOf(ch);
    if (value < 0) throw new CryptoError("recovery key has an invalid character");
    buffer = (buffer << 5) | value;
    bits += 5;
    if (bits >= 8) {
      out[i++] = (buffer >> (bits - 8)) & 255;
      bits -= 8;
      buffer &= (1 << bits) - 1;
    }
  }
  // 52 chars = 260 bits: the last character carries 1 data bit + 4 padding
  // bits, which must be 0 (so each key has exactly one spelling).
  if (buffer !== 0) throw new CryptoError("recovery key is invalid");
  return out;
}

export interface RecoveryKeys {
  /** Sent to the server to authorize recovery (stored there only as a hash). */
  authKey: Uint8Array;
  /** Wraps the user key. Never leaves the device. */
  wrapKey: Uint8Array;
}

export async function deriveRecoveryKeys(recoveryKey: Uint8Array): Promise<RecoveryKeys> {
  if (recoveryKey.length !== KEY_BYTES) throw new CryptoError("recovery key must be 32 bytes");
  const [authKey, wrapKey] = await Promise.all([
    hkdfSha256(recoveryKey, "recovery-auth"),
    hkdfSha256(recoveryKey, "recovery-enc"),
  ]);
  return { authKey, wrapKey };
}
