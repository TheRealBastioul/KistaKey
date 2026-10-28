// Master password -> master key (Argon2id) -> auth key + encryption key
// (HKDF-SHA256). ref/decisions.md §11.2–11.4.
import { utf8Encode } from "./encoding";
import { assertLength, CryptoError } from "./errors";
import { lib } from "./sodium";

export interface KdfParams {
  alg: "argon2id";
  memoryKiB: number;
  iterations: number;
  /** Always 1: libsodium's Argon2id has a single lane. Stored so it can change later. */
  parallelism: number;
}

export const DEFAULT_KDF_PARAMS: KdfParams = {
  alg: "argon2id",
  memoryKiB: 64 * 1024,
  iterations: 3,
  parallelism: 1,
};

/**
 * Bounds a client accepts. The floor stops a malicious or broken server from
 * handing out weak params (a cheap hash is a crackable hash); the ceiling
 * stops it from freezing the device.
 */
export const KDF_LIMITS = {
  memoryKiB: { min: 19 * 1024, max: 1024 * 1024 },
  iterations: { min: 2, max: 10 },
  parallelism: { min: 1, max: 1 },
} as const;

export const SALT_BYTES = 16;
export const KEY_BYTES = 32;

export function assertKdfParams(params: KdfParams): void {
  if (params.alg !== "argon2id") throw new CryptoError(`unsupported KDF "${params.alg}"`);
  for (const name of ["memoryKiB", "iterations", "parallelism"] as const) {
    const value = params[name];
    const { min, max } = KDF_LIMITS[name];
    if (!Number.isInteger(value) || value < min || value > max) {
      throw new CryptoError(`KDF ${name} must be an integer in [${min}, ${max}]`);
    }
  }
}

export function generateSalt(): Uint8Array {
  return lib().randombytes_buf(SALT_BYTES);
}

/**
 * Argon2id over the NFKC-normalized password, so the same password typed on
 * different platforms/keyboards derives the same key. Slow on purpose
 * (~1 s at the defaults): run it off the UI thread.
 */
export function deriveMasterKey(password: string, salt: Uint8Array, params: KdfParams): Uint8Array {
  assertKdfParams(params);
  assertLength(salt, SALT_BYTES, "salt");
  const sodium = lib();
  return sodium.crypto_pwhash(
    KEY_BYTES,
    utf8Encode(password.normalize("NFKC")),
    salt,
    params.iterations,
    params.memoryKiB * 1024,
    sodium.crypto_pwhash_ALG_ARGON2ID13,
  );
}

/** HKDF-SHA256 (RFC 5869) with an empty salt, via WebCrypto. */
export async function hkdfSha256(
  ikm: Uint8Array,
  info: string,
  length = KEY_BYTES,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", new Uint8Array(ikm), "HKDF", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: utf8Encode(info) },
    key,
    length * 8,
  );
  return new Uint8Array(bits);
}

export interface SubKeys {
  /** Sent to the server (which hashes it again) to prove the password. */
  authKey: Uint8Array;
  /** Wraps the user key. Never leaves the device. */
  encKey: Uint8Array;
}

export async function deriveSubKeys(masterKey: Uint8Array): Promise<SubKeys> {
  assertLength(masterKey, KEY_BYTES, "master key");
  const [authKey, encKey] = await Promise.all([
    hkdfSha256(masterKey, "auth"),
    hkdfSha256(masterKey, "enc"),
  ]);
  return { authKey, encKey };
}
