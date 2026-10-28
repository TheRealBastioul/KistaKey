// All client-side cryptography lives in this package, and only here.
// Web, extension and mobile import it; none of them call a crypto
// primitive directly. See README.md for the rules.
//
// Call `await ready()` once before anything else (loads libsodium).

export * from "./account";
export {
  concatBytes,
  fromBase64Url,
  fromHex,
  toBase64Url,
  toHex,
  utf8Decode,
  utf8Encode,
} from "./encoding";
export { CryptoError } from "./errors";
export {
  assertKdfParams,
  DEFAULT_KDF_PARAMS,
  deriveMasterKey,
  deriveSubKeys,
  generateSalt,
  KDF_LIMITS,
  type KdfParams,
  KEY_BYTES,
  SALT_BYTES,
  type SubKeys,
} from "./kdf";
export {
  generateKeyPair,
  generateSymmetricKey,
  type KeyPair,
  keyPairFromPrivateKey,
  openSealed,
  seal,
  unwrapKey,
  wrapKey,
} from "./keys";
export {
  deriveRecoveryKeys,
  formatRecoveryKey,
  generateRecoveryKey,
  parseRecoveryKey,
  RECOVERY_KEY_CHARS,
  type RecoveryKeys,
} from "./recovery";
export { ready, wipe } from "./sodium";
export { decrypt, encrypt, NONCE_BYTES, SYMMETRIC_ALG } from "./symmetric";
export { CRYPTO_FORMAT_VERSION } from "./version";
