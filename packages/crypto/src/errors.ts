/**
 * Thrown for malformed input and failed decryption. The message never
 * includes key material or plaintext.
 */
export class CryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CryptoError";
  }
}

export function assertLength(bytes: Uint8Array, length: number, what: string): void {
  if (bytes.length !== length) {
    throw new CryptoError(`${what} must be ${length} bytes, got ${bytes.length}`);
  }
}
