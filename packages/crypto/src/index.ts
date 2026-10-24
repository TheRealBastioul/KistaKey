// All client-side cryptography lives in this package, and only here.
// Web, extension and mobile import it; none of them call a crypto
// primitive directly. See README.md for the rules.
//
// Phase 1 adds: Argon2id key derivation, item encryption, key wrapping
// (libsodium). Until then this package only carries the format version
// and the known-answer test harness.

/**
 * Version tag written into every encrypted blob, so ciphertext produced
 * today can still be read after an algorithm change.
 */
export const CRYPTO_FORMAT_VERSION = 1 as const;
