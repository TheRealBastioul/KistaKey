// Symmetric keys, key wrapping, and X25519 keypairs + sealed boxes (for
// handing keys to other users from Phase 13).
import { fromBase64Url, toBase64Url } from "./encoding";
import { assertLength, CryptoError } from "./errors";
import { KEY_BYTES } from "./kdf";
import { lib } from "./sodium";
import { decrypt, encrypt } from "./symmetric";
import { CRYPTO_FORMAT_VERSION } from "./version";

/** 32 random bytes: user keys, item keys, org/lockbox keys. */
export function generateSymmetricKey(): Uint8Array {
  return lib().randombytes_buf(KEY_BYTES);
}

/**
 * Encrypts `key` under `wrappingKey` (same blob format as encrypt()). `aad`
 * (optional) binds the wrapped key to a context, e.g. the item it belongs to.
 */
export function wrapKey(wrappingKey: Uint8Array, key: Uint8Array, aad?: Uint8Array): string {
  assertLength(key, KEY_BYTES, "key to wrap");
  return encrypt(wrappingKey, key, aad);
}

export function unwrapKey(wrappingKey: Uint8Array, blob: string, aad?: Uint8Array): Uint8Array {
  const key = decrypt(wrappingKey, blob, aad);
  assertLength(key, KEY_BYTES, "unwrapped key");
  return key;
}

export interface KeyPair {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}

export function generateKeyPair(): KeyPair {
  const { publicKey, privateKey } = lib().crypto_box_keypair();
  return { publicKey, privateKey };
}

/** X25519 public key for a private key (keypairs are stored as the private key only). */
export function keyPairFromPrivateKey(privateKey: Uint8Array): KeyPair {
  assertLength(privateKey, KEY_BYTES, "private key");
  return { publicKey: lib().crypto_scalarmult_base(privateKey), privateKey };
}

const SEALED_HEADER = `v${CRYPTO_FORMAT_VERSION}.x25519sealed`;

/**
 * Anonymous sealed box to `publicKey`: only the private key holder can open
 * it. Blob: v<version>.x25519sealed.<base64url ciphertext>
 */
export function seal(publicKey: Uint8Array, message: Uint8Array): string {
  assertLength(publicKey, KEY_BYTES, "public key");
  return `${SEALED_HEADER}.${toBase64Url(lib().crypto_box_seal(message, publicKey))}`;
}

export function openSealed(keyPair: KeyPair, blob: string): Uint8Array {
  const [version, alg, ciphertextText, ...rest] = blob.split(".");
  if (ciphertextText === undefined || rest.length > 0) {
    throw new CryptoError("malformed sealed blob");
  }
  if (`${version}.${alg}` !== SEALED_HEADER) {
    throw new CryptoError(`unsupported sealed format "${version}.${alg}"`);
  }
  try {
    return lib().crypto_box_seal_open(
      fromBase64Url(ciphertextText),
      keyPair.publicKey,
      keyPair.privateKey,
    );
  } catch {
    throw new CryptoError("decryption failed");
  }
}
