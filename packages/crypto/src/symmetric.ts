// Authenticated symmetric encryption: XChaCha20-Poly1305 (libsodium AEAD).
// Blob: v<CRYPTO_FORMAT_VERSION>.xc20p.<base64url nonce>.<base64url ciphertext>
// The header is bound as associated data, so a blob can't be relabelled as
// another version/algorithm without failing to decrypt.
import { concatBytes, fromBase64Url, toBase64Url, utf8Encode } from "./encoding";
import { assertLength, CryptoError } from "./errors";
import { KEY_BYTES } from "./kdf";
import { lib } from "./sodium";
import { CRYPTO_FORMAT_VERSION } from "./version";

export const SYMMETRIC_ALG = "xc20p";
export const NONCE_BYTES = 24;
const HEADER = `v${CRYPTO_FORMAT_VERSION}.${SYMMETRIC_ALG}`;

function associatedData(aad: Uint8Array | undefined): Uint8Array {
  return concatBytes(utf8Encode(HEADER), aad ?? new Uint8Array(0));
}

/** Encrypts with a fresh random nonce. `aad` (optional) must be given again to decrypt. */
export function encrypt(key: Uint8Array, plaintext: Uint8Array, aad?: Uint8Array): string {
  return encryptWithNonce(key, plaintext, lib().randombytes_buf(NONCE_BYTES), aad);
}

/**
 * Fixed-nonce variant for known-answer vectors only. Reusing a nonce with
 * the same key breaks the cipher; app code always calls encrypt().
 */
export function encryptWithNonce(
  key: Uint8Array,
  plaintext: Uint8Array,
  nonce: Uint8Array,
  aad?: Uint8Array,
): string {
  assertLength(key, KEY_BYTES, "key");
  assertLength(nonce, NONCE_BYTES, "nonce");
  const ciphertext = lib().crypto_aead_xchacha20poly1305_ietf_encrypt(
    plaintext,
    associatedData(aad),
    null,
    nonce,
    key,
  );
  return `${HEADER}.${toBase64Url(nonce)}.${toBase64Url(ciphertext)}`;
}

export function decrypt(key: Uint8Array, blob: string, aad?: Uint8Array): Uint8Array {
  assertLength(key, KEY_BYTES, "key");
  const [version, alg, nonceText, ciphertextText, ...rest] = blob.split(".");
  if (nonceText === undefined || ciphertextText === undefined || rest.length > 0) {
    throw new CryptoError("malformed encrypted blob");
  }
  if (`${version}.${alg}` !== HEADER) {
    throw new CryptoError(`unsupported blob format "${version}.${alg}"`);
  }
  const nonce = fromBase64Url(nonceText);
  assertLength(nonce, NONCE_BYTES, "nonce");
  try {
    return lib().crypto_aead_xchacha20poly1305_ietf_decrypt(
      null,
      fromBase64Url(ciphertextText),
      associatedData(aad),
      nonce,
      key,
    );
  } catch {
    // Wrong key, tampered ciphertext/nonce, or wrong aad: indistinguishable on purpose.
    throw new CryptoError("decryption failed");
  }
}
