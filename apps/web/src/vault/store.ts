// The decrypted personal vault, in memory only (decisions §17). Sync pulls
// changes since the last revision, decrypts them in the crypto worker and
// merges them; a `full` response replaces everything. lock() drops every
// decrypted value and makes any sync still in flight discard its result.
//
// Dependencies are injected so the merge logic is testable without a worker
// or a server. The app's instance lives in ./useVault.ts.
import {
  type ItemData,
  ItemDataSchema,
  type ItemType,
  type VaultItem,
  type VaultSyncResponse,
} from "@repo/types";
import { errorMessage } from "../api/client";
import type {
  DecryptedFolderResult,
  DecryptedItemResult,
  EncryptedItemRef,
} from "../crypto/worker";
import { searchText } from "./search";

/** One item as the UI sees it. */
export interface VaultEntry {
  id: string;
  type: ItemType;
  folderId: string | null;
  revision: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  /** null: the item couldn't be decrypted or isn't valid item data. */
  data: ItemData | null;
  /** `data.name`, or a stand-in for an unreadable item. */
  name: string;
  /** Lowercased, accent-free text that search matches against. */
  search: string;
  /** The wire item, for edits (Phase 9 keeps the item key via `encryptedKey`). */
  encrypted: VaultItem;
}

export interface FolderEntry {
  id: string;
  /** null: couldn't decrypt. */
  name: string | null;
  revision: number;
}

export interface VaultSnapshot {
  /** idle: locked or not synced yet. loading: the first sync is running. */
  status: "idle" | "loading" | "ready" | "error";
  /** A sync is running (also after the first one). */
  syncing: boolean;
  error: string | null;
  revision: number | null;
  /** Sorted by name; trashed items included (`deletedAt` set). */
  items: VaultEntry[];
  /** Sorted by name. */
  folders: FolderEntry[];
  /** Item ids, most recently used first. */
  recent: string[];
}

export interface VaultStoreDeps {
  api: { sync(since?: number): Promise<VaultSyncResponse> };
  crypto: {
    decryptItems(key: Uint8Array, items: EncryptedItemRef[]): Promise<DecryptedItemResult[]>;
    decryptFolders(
      key: Uint8Array,
      folders: { id: string; encryptedName: string }[],
    ): Promise<DecryptedFolderResult[]>;
  };
  /** The user key, or null while locked. */
  getKey(): Uint8Array | null;
}

export interface VaultStore {
  getSnapshot(): VaultSnapshot;
  subscribe(listener: () => void): () => void;
  /** Pull and merge changes. Never rejects: failures land in `snapshot.error`. */
  sync(): Promise<void>;
  /** Copy, reveal or open: moves the item to the front of `recent`. */
  markUsed(id: string): void;
  /** Drops the decrypted vault. */
  lock(): void;
}

export const RECENT_LIMIT = 8;
export const UNREADABLE_NAME = "Unreadable item";

const EMPTY: VaultSnapshot = {
  status: "idle",
  syncing: false,
  error: null,
  revision: null,
  items: [],
  folders: [],
  recent: [],
};

const byName = (a: { name: string | null }, b: { name: string | null }) =>
  (a.name ?? "").localeCompare(b.name ?? "", undefined, { sensitivity: "base" });

function toEntry(item: VaultItem, result: DecryptedItemResult | undefined): VaultEntry {
  const parsed = result?.ok ? ItemDataSchema.safeParse(result.data) : null;
  const data = parsed?.success ? parsed.data : null;
  return {
    id: item.id,
    type: item.type,
    folderId: item.folderId,
    revision: item.revision,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    deletedAt: item.deletedAt,
    data,
    name: data?.name ?? UNREADABLE_NAME,
    search: searchText(data),
    encrypted: item,
  };
}

export function createVaultStore({ api, crypto, getKey }: VaultStoreDeps): VaultStore {
  let snapshot = EMPTY;
  let items = new Map<string, VaultEntry>();
  let folders = new Map<string, FolderEntry>();
  /** Bumped by lock(): a sync that started before it throws its result away. */
  let generation = 0;
  let running: Promise<void> | null = null;
  let again = false;
  const listeners = new Set<() => void>();

  const replace = (next: VaultSnapshot) => {
    snapshot = next;
    for (const listener of listeners) listener();
  };
  const publish = (patch: Partial<VaultSnapshot>) => replace({ ...snapshot, ...patch });

  const lists = () => ({
    items: [...items.values()].sort(byName),
    folders: [...folders.values()].sort(byName),
  });

  async function pull(gen: number): Promise<void> {
    if (!getKey()) return;
    const res = await api.sync(snapshot.revision ?? undefined);
    if (gen !== generation) return;
    const key = getKey();
    if (!key) return;
    const noItems: DecryptedItemResult[] = [];
    const noFolders: DecryptedFolderResult[] = [];
    const [decryptedItems, decryptedFolders] = await Promise.all([
      res.items.length ? crypto.decryptItems(key, res.items) : noItems,
      res.folders.length ? crypto.decryptFolders(key, res.folders) : noFolders,
    ]);
    if (gen !== generation) return;

    const nextItems = res.full ? new Map<string, VaultEntry>() : new Map(items);
    const nextFolders = res.full ? new Map<string, FolderEntry>() : new Map(folders);
    const itemResults = new Map(decryptedItems.map((r) => [r.id, r]));
    const folderNames = new Map(decryptedFolders.map((r) => [r.id, r.name]));

    for (const item of res.items) {
      const current = nextItems.get(item.id);
      if (current && current.revision > item.revision) continue;
      nextItems.set(item.id, toEntry(item, itemResults.get(item.id)));
    }
    for (const folder of res.folders) {
      const current = nextFolders.get(folder.id);
      if (current && current.revision > folder.revision) continue;
      nextFolders.set(folder.id, {
        id: folder.id,
        name: folderNames.get(folder.id) ?? null,
        revision: folder.revision,
      });
    }
    for (const id of res.deletedItemIds) nextItems.delete(id);
    for (const id of res.deletedFolderIds) nextFolders.delete(id);

    items = nextItems;
    folders = nextFolders;
    publish({
      ...lists(),
      status: "ready",
      error: null,
      revision: res.revision,
      recent: snapshot.recent.filter((id) => items.has(id)),
    });
  }

  /** Pulls until no further sync was requested meanwhile. Never rejects. */
  async function loop(gen: number): Promise<void> {
    publish({ syncing: true, status: snapshot.status === "ready" ? "ready" : "loading" });
    try {
      do {
        again = false;
        await pull(gen);
      } while (again && gen === generation);
      if (gen === generation) publish({ syncing: false });
    } catch (err) {
      if (gen !== generation) return;
      publish({
        syncing: false,
        error: errorMessage(err),
        // Keep showing what we have; only a failed first load is an error page.
        status: snapshot.status === "ready" ? "ready" : "error",
      });
    }
  }

  function sync(): Promise<void> {
    if (!getKey()) return Promise.resolve();
    if (running) {
      again = true;
      return running;
    }
    // lock() may have started a newer run by the time this one ends: only clear our own.
    const run: Promise<void> = loop(generation).finally(() => {
      if (running === run) running = null;
    });
    running = run;
    return run;
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    sync,
    markUsed(id) {
      if (!items.has(id) || snapshot.recent[0] === id) return;
      publish({ recent: [id, ...snapshot.recent.filter((r) => r !== id)].slice(0, RECENT_LIMIT) });
    },
    lock() {
      generation++;
      running = null;
      again = false;
      items = new Map();
      folders = new Map();
      if (snapshot !== EMPTY) replace(EMPTY);
    },
  };
}
