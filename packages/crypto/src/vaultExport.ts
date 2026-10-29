// Encrypted vault export (ref/decisions.md §21): the whole export document
// as one blob under the user key, with its own associated-data label so it
// can't be passed off as (or replaced by) any other blob. Only the same
// account can open it again, which is the point: it's a backup to re-import,
// not a way to move data to another account or app.
import { utf8Decode, utf8Encode } from "./encoding";
import { CryptoError } from "./errors";
import { wipe } from "./sodium";
import { decrypt, encrypt } from "./symmetric";

const EXPORT_AAD = "vault-export:v1";

export function encryptVaultExport(userKey: Uint8Array, json: string): string {
  const plaintext = utf8Encode(json);
  try {
    return encrypt(userKey, plaintext, utf8Encode(EXPORT_AAD));
  } finally {
    plaintext.fill(0);
  }
}

/** Throws CryptoError if the blob isn't an export of this account. */
export function decryptVaultExport(userKey: Uint8Array, blob: string): string {
  const plaintext = decrypt(userKey, blob, utf8Encode(EXPORT_AAD));
  try {
    return utf8Decode(plaintext);
  } catch (error) {
    if (error instanceof CryptoError) throw error;
    throw new CryptoError("export is not valid text");
  } finally {
    wipe(plaintext);
  }
}
