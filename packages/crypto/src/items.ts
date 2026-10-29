// Vault items and folders (ref/decisions.md §15). Every item has its own
// random 32-byte key, wrapped by the user key (from Phase 13 also by a
// lockbox key), and all of its fields are one JSON blob encrypted under that
// item key. The item id is bound as associated data on both blobs, with a
// different label for each, so the server can't swap blobs between items or
// pass a wrapped key off as item data. Folder names work the same way under
// the user key.
//
// Item data comes back as `unknown`: callers validate it with the
// @repo/types item schema (this package has no zod).
import { utf8Decode, utf8Encode } from "./encoding";
import { CryptoError } from "./errors";
import { generateSymmetricKey, unwrapKey, wrapKey } from "./keys";
import { wipe } from "./sodium";
import { decrypt, encrypt } from "./symmetric";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** `<label>:<lowercase uuid>`, the associated data for one blob. */
function context(label: "item-key" | "item-data" | "folder-name", id: string): Uint8Array {
  const normalized = id.toLowerCase();
  if (!UUID.test(normalized)) throw new CryptoError("id must be a UUID");
  return utf8Encode(`${label}:${normalized}`);
}

/** What the server stores for an item (besides plaintext metadata). */
export interface EncryptedItem {
  encryptedKey: string;
  encryptedData: string;
}

export function wrapItemKey(wrappingKey: Uint8Array, itemId: string, itemKey: Uint8Array): string {
  return wrapKey(wrappingKey, itemKey, context("item-key", itemId));
}

export function unwrapItemKey(
  wrappingKey: Uint8Array,
  itemId: string,
  encryptedKey: string,
): Uint8Array {
  return unwrapKey(wrappingKey, encryptedKey, context("item-key", itemId));
}

export function encryptItemData(itemKey: Uint8Array, itemId: string, data: unknown): string {
  const json = JSON.stringify(data);
  if (json === undefined) throw new CryptoError("item data must be JSON");
  const plaintext = utf8Encode(json);
  try {
    return encrypt(itemKey, plaintext, context("item-data", itemId));
  } finally {
    plaintext.fill(0);
  }
}

export function decryptItemData(
  itemKey: Uint8Array,
  itemId: string,
  encryptedData: string,
): unknown {
  const plaintext = decrypt(itemKey, encryptedData, context("item-data", itemId));
  try {
    return JSON.parse(utf8Decode(plaintext));
  } catch (error) {
    if (error instanceof CryptoError) throw error;
    throw new CryptoError("item data is not valid JSON");
  } finally {
    wipe(plaintext);
  }
}

/**
 * New item: pass no `encryptedKey` and a fresh item key is made. Edit: pass
 * the item's current `encryptedKey` so the item key stays the same (anyone
 * it was shared with keeps access to the new version).
 */
export function encryptItem(
  wrappingKey: Uint8Array,
  itemId: string,
  data: unknown,
  encryptedKey?: string,
): EncryptedItem {
  const itemKey =
    encryptedKey === undefined
      ? generateSymmetricKey()
      : unwrapItemKey(wrappingKey, itemId, encryptedKey);
  try {
    return {
      encryptedKey: encryptedKey ?? wrapItemKey(wrappingKey, itemId, itemKey),
      encryptedData: encryptItemData(itemKey, itemId, data),
    };
  } finally {
    wipe(itemKey);
  }
}

/** Throws CryptoError("decryption failed") for a wrong key, wrong id or tampered blob. */
export function decryptItem(wrappingKey: Uint8Array, itemId: string, item: EncryptedItem): unknown {
  const itemKey = unwrapItemKey(wrappingKey, itemId, item.encryptedKey);
  try {
    return decryptItemData(itemKey, itemId, item.encryptedData);
  } finally {
    wipe(itemKey);
  }
}

/**
 * Moves an item key under another wrapping key (Phase 13+: personal item
 * into a lockbox, or back). The data blob doesn't change.
 */
export function rewrapItemKey(
  fromKey: Uint8Array,
  toKey: Uint8Array,
  itemId: string,
  encryptedKey: string,
): string {
  const itemKey = unwrapItemKey(fromKey, itemId, encryptedKey);
  try {
    return wrapItemKey(toKey, itemId, itemKey);
  } finally {
    wipe(itemKey);
  }
}

export function encryptFolderName(userKey: Uint8Array, folderId: string, name: string): string {
  return encrypt(userKey, utf8Encode(name), context("folder-name", folderId));
}

export function decryptFolderName(
  userKey: Uint8Array,
  folderId: string,
  encryptedName: string,
): string {
  return utf8Decode(decrypt(userKey, encryptedName, context("folder-name", folderId)));
}
