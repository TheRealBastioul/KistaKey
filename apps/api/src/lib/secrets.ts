// Server-side secret handling on node:crypto. This is not client crypto
// (that's @repo/crypto): it's how the server stores what clients send it.
// - Tokens (sessions, devices, email links): 32 random bytes, stored as SHA-256.
// - authKey / recoveryAuthKey: Argon2id again (PHC string), so a DB leak
//   isn't directly a login.
// - Short codes (MFA recovery codes): HMAC-SHA256 with SERVER_HMAC_KEY.
// - Server-readable secrets (TOTP seeds): AES-256-GCM with SERVER_ENCRYPTION_KEY.
import {
  argon2,
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";

const argon2Async = promisify(argon2);

/** URL-safe random token (base64url). 32 bytes = 256 bits. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** HMAC-SHA256 with a purpose label, so one key can't be confused across uses. */
export function hmac(key: Buffer, purpose: string, value: string): Buffer {
  return createHmac("sha256", key).update(`${purpose}\0${value}`).digest();
}

/**
 * Constant-time string comparison. Compares digests so the inputs' lengths
 * don't leak through timing either.
 */
export function safeEqual(a: string, b: string): boolean {
  return timingSafeEqual(
    createHash("sha256").update(a).digest(),
    createHash("sha256").update(b).digest(),
  );
}

export interface SecretHashParams {
  memoryKiB: number;
  passes: number;
  parallelism: number;
}

/** OWASP's Argon2id minimum. The input is already a 256-bit key, so this is defence in depth. */
export const DEFAULT_SECRET_HASH_PARAMS: SecretHashParams = {
  memoryKiB: 19 * 1024,
  passes: 2,
  parallelism: 1,
};

const PHC = /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/;

async function argon2id(secret: string, salt: Buffer, params: SecretHashParams): Promise<Buffer> {
  return argon2Async("argon2id", {
    message: secret,
    nonce: salt,
    memory: params.memoryKiB,
    passes: params.passes,
    parallelism: params.parallelism,
    tagLength: 32,
  });
}

const b64 = (buf: Buffer) => buf.toString("base64").replace(/=+$/, "");

/** Argon2id PHC string: $argon2id$v=19$m=..,t=..,p=..$<salt>$<hash>. */
export async function hashSecret(
  secret: string,
  params: SecretHashParams = DEFAULT_SECRET_HASH_PARAMS,
): Promise<string> {
  const salt = randomBytes(16);
  const hash = await argon2id(secret, salt, params);
  return `$argon2id$v=19$m=${params.memoryKiB},t=${params.passes},p=${params.parallelism}$${b64(salt)}$${b64(hash)}`;
}

export async function verifySecret(secret: string, encoded: string): Promise<boolean> {
  const m = PHC.exec(encoded);
  if (!m) return false;
  const [, memory, passes, parallelism, salt, expected] = m;
  const hash = await argon2id(secret, Buffer.from(salt ?? "", "base64"), {
    memoryKiB: Number(memory),
    passes: Number(passes),
    parallelism: Number(parallelism),
  });
  const want = Buffer.from(expected ?? "", "base64");
  return hash.length === want.length && timingSafeEqual(hash, want);
}

/**
 * Runs one full hash verification against a throwaway hash, so a request
 * for an unknown account takes as long as one for a real account.
 */
export function createDummyVerifier(params: SecretHashParams = DEFAULT_SECRET_HASH_PARAMS) {
  let dummy: Promise<string> | undefined;
  return async (secret: string): Promise<false> => {
    dummy ??= hashSecret(randomToken(), params);
    await verifySecret(secret, await dummy);
    return false;
  };
}

const SERVER_SECRET_HEADER = "v1.aesgcm";

/** AES-256-GCM: v1.aesgcm.<iv>.<ciphertext+tag> (base64url). */
export function sealServerSecret(key: Buffer, plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(SERVER_SECRET_HEADER));
  const body = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
  return `${SERVER_SECRET_HEADER}.${iv.toString("base64url")}.${body.toString("base64url")}`;
}

export function openServerSecret(key: Buffer, blob: string): string {
  const [version, alg, ivText, bodyText] = blob.split(".");
  if (`${version}.${alg}` !== SERVER_SECRET_HEADER || !ivText || !bodyText) {
    throw new Error("malformed server secret");
  }
  const body = Buffer.from(bodyText, "base64url");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivText, "base64url"));
  decipher.setAAD(Buffer.from(SERVER_SECRET_HEADER));
  decipher.setAuthTag(body.subarray(body.length - 16));
  return Buffer.concat([
    decipher.update(body.subarray(0, body.length - 16)),
    decipher.final(),
  ]).toString("utf8");
}
