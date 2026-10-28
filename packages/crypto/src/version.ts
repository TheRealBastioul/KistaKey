/**
 * Version tag written into every encrypted blob, so ciphertext produced
 * today can still be read after an algorithm change.
 */
export const CRYPTO_FORMAT_VERSION = 1 as const;
