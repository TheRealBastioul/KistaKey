import type { ItemDataInput, VaultItem, VaultSyncResponse } from "@repo/types";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/client";
import { createVaultStore, UNREADABLE_NAME, type VaultStoreDeps } from "./store";

const T = "2026-10-28T12:00:00.000Z";

// Fake crypto: `encryptedData` is the item JSON itself ("bad" fails to decrypt).
function item(
  id: string,
  revision: number,
  data: ItemDataInput | "bad",
  extra: Partial<VaultItem> = {},
): VaultItem {
  return {
    id,
    type: "login",
    folderId: null,
    encryptedKey: "key",
    encryptedData: data === "bad" ? "bad" : JSON.stringify(data),
    revision,
    createdAt: T,
    updatedAt: T,
    deletedAt: null,
    ...extra,
  };
}

function response(patch: Partial<VaultSyncResponse>): VaultSyncResponse {
  return {
    revision: 1,
    full: false,
    items: [],
    folders: [],
    deletedItemIds: [],
    deletedFolderIds: [],
    ...patch,
  };
}

function setup(responses: VaultSyncResponse[]) {
  let key: Uint8Array | null = new Uint8Array(32);
  const sync = vi.fn(async (_since?: number) => {
    const next = responses.shift();
    if (!next) throw new Error("no more responses");
    return next;
  });
  const deps: VaultStoreDeps = {
    api: { sync },
    crypto: {
      decryptItems: async (_key, items) =>
        items.map((i) =>
          i.encryptedData === "bad"
            ? { id: i.id, data: null, ok: false }
            : { id: i.id, data: JSON.parse(i.encryptedData), ok: true },
        ),
      decryptFolders: async (_key, folders) =>
        folders.map((f) => ({
          id: f.id,
          name: f.encryptedName === "bad" ? null : f.encryptedName,
        })),
    },
    getKey: () => key,
  };
  const store = createVaultStore(deps);
  return {
    store,
    sync,
    setLocked() {
      key = null;
    },
  };
}

const names = (store: ReturnType<typeof setup>["store"]) =>
  store.getSnapshot().items.map((e) => e.name);

describe("vault store", () => {
  it("full sync loads and sorts items and folders", async () => {
    const { store, sync } = setup([
      response({
        revision: 5,
        full: true,
        items: [item("b", 3, { name: "beta" }), item("a", 4, { name: "Alpha" })],
        folders: [{ id: "f", encryptedName: "Work", revision: 2, createdAt: T, updatedAt: T }],
      }),
    ]);
    await store.sync();
    expect(sync).toHaveBeenCalledWith(undefined);
    const snap = store.getSnapshot();
    expect(snap.status).toBe("ready");
    expect(snap.revision).toBe(5);
    expect(names(store)).toEqual(["Alpha", "beta"]);
    expect(snap.folders.map((f) => f.name)).toEqual(["Work"]);
  });

  it("merges updates, tombstones and trash since the last revision", async () => {
    const { store, sync } = setup([
      response({
        revision: 5,
        full: true,
        items: [
          item("a", 1, { name: "A" }),
          item("b", 2, { name: "B" }),
          item("c", 3, { name: "C" }),
        ],
        folders: [{ id: "f", encryptedName: "Old", revision: 1, createdAt: T, updatedAt: T }],
      }),
      response({
        revision: 8,
        items: [
          item("a", 6, { name: "A2" }),
          item("b", 7, { name: "B" }, { deletedAt: T }),
          item("d", 8, { name: "D" }),
        ],
        deletedItemIds: ["c"],
        deletedFolderIds: ["f"],
      }),
    ]);
    await store.sync();
    await store.sync();
    expect(sync).toHaveBeenLastCalledWith(5);
    const snap = store.getSnapshot();
    expect(snap.revision).toBe(8);
    expect(names(store)).toEqual(["A2", "B", "D"]);
    expect(snap.items.find((e) => e.id === "b")?.deletedAt).toBe(T);
    expect(snap.folders).toEqual([]);
  });

  it("a full response replaces the vault instead of merging", async () => {
    const { store } = setup([
      response({ revision: 2, full: true, items: [item("a", 1, { name: "A" })] }),
      response({ revision: 9, full: true, items: [item("z", 9, { name: "Z" })] }),
    ]);
    await store.sync();
    await store.sync();
    expect(names(store)).toEqual(["Z"]);
  });

  it("never replaces an entry with an older revision", async () => {
    const { store } = setup([
      response({ revision: 5, full: true, items: [item("a", 5, { name: "new" })] }),
      response({ revision: 6, items: [item("a", 4, { name: "old" })] }),
    ]);
    await store.sync();
    await store.sync();
    expect(names(store)).toEqual(["new"]);
  });

  it("keeps undecryptable or invalid items as unreadable entries", async () => {
    const { store } = setup([
      response({
        revision: 2,
        full: true,
        items: [item("a", 1, "bad"), item("b", 2, { name: "" })],
        folders: [{ id: "f", encryptedName: "bad", revision: 1, createdAt: T, updatedAt: T }],
      }),
    ]);
    await store.sync();
    const snap = store.getSnapshot();
    expect(snap.items.map((e) => [e.name, e.data])).toEqual([
      [UNREADABLE_NAME, null],
      [UNREADABLE_NAME, null],
    ]);
    expect(snap.folders[0]?.name).toBeNull();
  });

  it("indexes searchable text but not secrets", async () => {
    const { store } = setup([
      response({
        revision: 1,
        full: true,
        items: [
          item("a", 1, {
            name: "Café",
            login: { username: "me@x.io", password: "hunter2", uris: [{ uri: "shop.example" }] },
          }),
        ],
      }),
    ]);
    await store.sync();
    const search = store.getSnapshot().items[0]?.search ?? "";
    expect(search).toContain("cafe");
    expect(search).toContain("me@x.io");
    expect(search).toContain("shop.example");
    expect(search).not.toContain("hunter2");
  });

  it("lock wipes the decrypted vault", async () => {
    const { store } = setup([
      response({ revision: 3, full: true, items: [item("a", 1, { name: "A" })] }),
    ]);
    await store.sync();
    store.markUsed("a");
    store.lock();
    const snap = store.getSnapshot();
    expect(snap).toMatchObject({
      status: "idle",
      revision: null,
      items: [],
      folders: [],
      recent: [],
    });
  });

  it("a sync in flight when the vault locks doesn't bring the data back", async () => {
    let release: (value: VaultSyncResponse) => void = () => {};
    const { store, sync } = setup([]);
    sync.mockImplementationOnce(
      () =>
        new Promise<VaultSyncResponse>((resolve) => {
          release = resolve;
        }),
    );
    const done = store.sync();
    store.lock();
    release(response({ revision: 1, full: true, items: [item("a", 1, { name: "A" })] }));
    await done;
    expect(store.getSnapshot()).toMatchObject({ status: "idle", items: [] });
  });

  it("does nothing while locked", async () => {
    const { store, sync, setLocked } = setup([]);
    setLocked();
    await store.sync();
    expect(sync).not.toHaveBeenCalled();
  });

  it("a failed first sync is an error; a later failure keeps the data", async () => {
    const { store, sync } = setup([
      response({ revision: 1, full: true, items: [item("a", 1, { name: "A" })] }),
    ]);
    sync.mockRejectedValueOnce(new ApiError(0, "NETWORK", "offline"));
    await store.sync();
    expect(store.getSnapshot()).toMatchObject({ status: "error", error: "offline" });
    await store.sync();
    expect(store.getSnapshot()).toMatchObject({ status: "ready", error: null });
    sync.mockRejectedValueOnce(new ApiError(0, "NETWORK", "offline"));
    await store.sync();
    expect(store.getSnapshot()).toMatchObject({ status: "ready", error: "offline" });
    expect(names(store)).toEqual(["A"]);
  });

  it("a sync requested while one runs runs once more afterwards", async () => {
    const { store, sync } = setup([
      response({ revision: 1, full: true, items: [item("a", 1, { name: "A" })] }),
      response({ revision: 2, items: [item("b", 2, { name: "B" })] }),
    ]);
    const first = store.sync();
    const second = store.sync();
    await Promise.all([first, second]);
    expect(sync).toHaveBeenCalledTimes(2);
    expect(names(store)).toEqual(["A", "B"]);
  });

  it("recent keeps the latest uses first, without duplicates", async () => {
    const { store } = setup([
      response({
        revision: 1,
        full: true,
        items: [item("a", 1, { name: "A" }), item("b", 1, { name: "B" })],
      }),
    ]);
    await store.sync();
    store.markUsed("a");
    store.markUsed("b");
    store.markUsed("a");
    store.markUsed("missing");
    expect(store.getSnapshot().recent).toEqual(["a", "b"]);
  });
});
