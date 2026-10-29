// The app's vault store, its live-update connection, and the actions the
// vault pages call. Every write goes to the API and is followed by a sync,
// so the store only ever shows what the server has. Locking the key store (Lock now, auto-lock, sign out)
// drops the decrypted vault.
//
// Edits send the revision the user started from. A 409 becomes an
// ItemConflict with the stored version decrypted, for the conflict dialog;
// only favorite and folder moves are last-write-wins (decisions §18).
import {
  FolderNameSchema,
  ItemConflictDetailsSchema,
  type ItemData,
  ItemDataSchema,
  type ItemType,
  type VaultItem,
} from "@repo/types";
import { useSyncExternalStore } from "react";
import { ApiError, apiUrl } from "../api/client";
import { vaultApi } from "../api/vault";
import { keyStore } from "../auth/keyStore";
import { cryptoClient } from "../crypto/client";
import type { ImportChunk } from "./import";
import { createLiveSync, type LiveStatus } from "./live";
import { createVaultStore, type VaultEntry, type VaultSnapshot } from "./store";

export const vaultStore = createVaultStore({
  api: vaultApi,
  crypto: {
    decryptItems: (key, items) =>
      cryptoClient.call(
        "decryptItems",
        key,
        items.map(({ id, encryptedKey, encryptedData }) => ({ id, encryptedKey, encryptedData })),
      ),
    decryptFolders: (key, folders) =>
      cryptoClient.call(
        "decryptFolders",
        key,
        folders.map(({ id, encryptedName }) => ({ id, encryptedName })),
      ),
  },
  getKey: () => keyStore.get(),
});

/** Live updates for the vault pages (started by VaultPage, decisions §19). */
export const liveSync = createLiveSync({
  open() {
    const es = new EventSource(apiUrl("/vault/events"));
    return {
      addEventListener: (type, listener) =>
        es.addEventListener(type, (event) => listener({ data: (event as MessageEvent).data })),
      close: () => es.close(),
    };
  },
  sync: () => vaultStore.sync(),
  revision: () => vaultStore.getSnapshot().revision,
});

keyStore.subscribe(() => {
  if (keyStore.isUnlocked()) return;
  liveSync.stop();
  vaultStore.lock();
});

export function useVault(): VaultSnapshot {
  return useSyncExternalStore(vaultStore.subscribe, vaultStore.getSnapshot);
}

export function useLiveStatus(): LiveStatus {
  return useSyncExternalStore(liveSync.subscribe, liveSync.status);
}

function requireKey(): Uint8Array {
  const key = keyStore.get();
  if (!key) throw new Error("The vault is locked");
  return key;
}

async function thenSync<T>(write: Promise<T>): Promise<T> {
  const result = await write;
  await vaultStore.sync();
  return result;
}

/** The item changed (or was trashed) since the edit started. */
export class ItemConflict extends Error {
  constructor(
    /** The item as stored now. */
    readonly current: VaultItem,
    /** Its decrypted data; null if it can't be read. */
    readonly data: ItemData | null,
  ) {
    super("This item was changed somewhere else.");
    this.name = "ItemConflict";
  }
}

async function decryptWire(item: VaultItem): Promise<ItemData | null> {
  const [result] = await cryptoClient.call("decryptItems", requireKey(), [
    { id: item.id, encryptedKey: item.encryptedKey, encryptedData: item.encryptedData },
  ]);
  const parsed = result?.ok ? ItemDataSchema.safeParse(result.data) : null;
  return parsed?.success ? parsed.data : null;
}

/** PUT with `expectedRevision`; a 409 is rethrown as ItemConflict. No sync. */
async function put(
  item: VaultItem,
  folderId: string | null,
  data: ItemData,
  expectedRevision: number,
): Promise<void> {
  const encrypted = await cryptoClient.call(
    "encryptItem",
    requireKey(),
    item.id,
    data,
    item.encryptedKey,
  );
  try {
    await vaultApi.updateItem(item.id, { folderId, ...encrypted, expectedRevision });
  } catch (err) {
    const details =
      err instanceof ApiError && err.code === "CONFLICT"
        ? ItemConflictDetailsSchema.safeParse(err.details)
        : null;
    if (!details?.success) throw err;
    const current = details.data.current;
    throw new ItemConflict(current, await decryptWire(current));
  }
}

/**
 * Favorite and folder moves: apply the change to whatever is stored now. On
 * a conflict, retry once on the current version (unless it's in the trash).
 */
async function lastWriteWins(
  entry: VaultEntry,
  change: { favorite?: boolean; folderId?: string | null },
): Promise<void> {
  const apply = (item: VaultItem, data: ItemData) =>
    put(
      item,
      change.folderId === undefined ? item.folderId : change.folderId,
      change.favorite === undefined ? data : { ...data, favorite: change.favorite },
      item.revision,
    );
  if (!entry.data) throw new Error("This item can't be read, so it can't be changed.");
  try {
    await apply(entry.encrypted, entry.data);
  } catch (err) {
    if (!(err instanceof ItemConflict) || err.current.deletedAt || !err.data) throw err;
    await apply(err.current, err.data);
  } finally {
    await vaultStore.sync();
  }
}

export const vaultActions = {
  /** Encrypts with a fresh item key and creates the item. Returns its id. */
  async createItem(type: ItemType, folderId: string | null, data: ItemData): Promise<string> {
    const id = crypto.randomUUID();
    const encrypted = await cryptoClient.call("encryptItem", requireKey(), id, data);
    await thenSync(vaultApi.createItem({ id, type, folderId, ...encrypted }));
    return id;
  },

  /**
   * Saves an edit made on top of `base` (the item as it was when editing
   * started, or the conflict's current version to overwrite it). Keeps the
   * item key. Throws ItemConflict if the item changed meanwhile.
   */
  async updateItem(base: VaultItem, folderId: string | null, data: ItemData): Promise<void> {
    try {
      await put(base, folderId, data, base.revision);
    } finally {
      await vaultStore.sync();
    }
  },

  setFavorite: (entry: VaultEntry, favorite: boolean) => lastWriteWins(entry, { favorite }),
  moveToFolder: (entry: VaultEntry, folderId: string | null) => lastWriteWins(entry, { folderId }),

  trash: (id: string) => thenSync(vaultApi.trashItem(id)),
  restore: (id: string) => thenSync(vaultApi.restoreItem(id)),
  purge: (id: string) => thenSync(vaultApi.purgeItem(id)),

  /** Returns the new folder's id. Throws a ZodError for an empty or too long name. */
  async createFolder(name: string): Promise<string> {
    const id = crypto.randomUUID();
    const encryptedName = await cryptoClient.call(
      "encryptFolderName",
      requireKey(),
      id,
      FolderNameSchema.parse(name),
    );
    await thenSync(vaultApi.createFolder({ id, encryptedName }));
    return id;
  },

  async renameFolder(id: string, name: string): Promise<void> {
    const encryptedName = await cryptoClient.call(
      "encryptFolderName",
      requireKey(),
      id,
      FolderNameSchema.parse(name),
    );
    await thenSync(vaultApi.renameFolder(id, encryptedName));
  },

  deleteFolder: (id: string) => thenSync(vaultApi.deleteFolder(id)),

  /**
   * Encrypts and uploads an import plan batch by batch (each all or
   * nothing). `onProgress` gets the number of items stored so far; if a
   * batch fails, the earlier ones stay imported and the error is rethrown.
   */
  async importChunks(
    format: string,
    chunks: ImportChunk[],
    onProgress: (done: number) => void,
  ): Promise<void> {
    let done = 0;
    try {
      for (const chunk of chunks) {
        const encrypted = await cryptoClient.call(
          "encryptImportBatch",
          requireKey(),
          chunk.items.map(({ id, data }) => ({ id, data })),
          chunk.folders,
        );
        await vaultApi.importBatch({
          format,
          folders: encrypted.folders,
          items: chunk.items.map((item, index) => {
            const blobs = encrypted.items[index];
            if (blobs?.id !== item.id) throw new Error("Encryption returned items out of order");
            return {
              id: item.id,
              type: item.type,
              folderId: item.folderId,
              encryptedKey: blobs.encryptedKey,
              encryptedData: blobs.encryptedData,
            };
          }),
        });
        done += chunk.items.length;
        onProgress(done);
      }
    } finally {
      await vaultStore.sync();
    }
  },

  /** Decrypts an encrypted export's blob (this account's only). */
  decryptExport: (blob: string) => cryptoClient.call("decryptVaultExport", requireKey(), blob),
  encryptExport: (json: string) => cryptoClient.call("encryptVaultExport", requireKey(), json),
};
