// Vault API (Phase 7) against real Postgres + Redis (skipped unless
// TEST_DATABASE_URL and TEST_REDIS_URL are set). Items and folders are
// encrypted with the real @repo/crypto, like a browser would.
import { randomUUID } from "node:crypto";
import * as crypto from "@repo/crypto";
import type {
  ItemConflictDetails,
  ItemResponse,
  VaultBatchImportResponse,
  VaultItem,
  VaultSyncResponse,
} from "@repo/types";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client, canRun, createHarness, type Harness, readyAccount } from "./harness";

const SLOW = 60_000;
const DAY_MS = 24 * 60 * 60 * 1000;
/** A value that must never appear in any column or audit row. */
const MARKER = `plaintext-marker-${randomUUID()}`;

type Ready = Awaited<ReturnType<typeof readyAccount>>;

function newItem(userKey: Uint8Array, data: unknown, folderId: string | null = null) {
  const id = randomUUID();
  return { id, type: "login" as const, folderId, ...crypto.encryptItem(userKey, id, data) };
}

function loginData(name: string, password = "hunter2") {
  return { name, login: { username: "me", password, uris: [] } };
}

function newFolder(userKey: Uint8Array, name: string) {
  const id = randomUUID();
  return { id, encryptedName: crypto.encryptFolderName(userKey, id, name) };
}

async function sync(client: Client, since?: number): Promise<VaultSyncResponse> {
  const res = await client.request(
    "GET",
    `/vault/sync${since === undefined ? "" : `?since=${since}`}`,
  );
  expect(res.statusCode).toBe(200);
  return res.json<VaultSyncResponse>();
}

async function create(client: Client, body: unknown): Promise<VaultItem> {
  const res = await client.request("POST", "/vault/items", body);
  expect(res.statusCode, String(res.body)).toBe(200);
  return res.json<ItemResponse>().item;
}

describe.skipIf(!canRun)("vault (integration)", () => {
  let h: Harness;
  let alice: Ready;
  let bob: Ready;

  beforeAll(async () => {
    h = await createHarness();
    alice = await readyAccount(h, "vault-a");
    bob = await readyAccount(h, "vault-b");
  }, SLOW);

  afterAll(async () => {
    await h?.close();
  });

  const keyOf = (who: Ready) => who.account.created.userKey;

  it("needs a signed-in session", async () => {
    const res = await new Client(h.app).request("GET", "/vault/sync");
    expect(res.statusCode).toBe(401);
  });

  it("creates, syncs since a revision, trashes, restores and deletes for good", async () => {
    const c = alice.client;
    const key = keyOf(alice);
    const empty = await sync(c);
    expect(empty.full).toBe(true);

    const folder = newFolder(key, "Work");
    const folderRes = await c.request("POST", "/vault/folders", folder);
    expect(folderRes.statusCode).toBe(200);

    const draft = newItem(key, loginData("Mail"), folder.id);
    const item = await create(c, draft);
    expect(item.folderId).toBe(folder.id);
    expect(crypto.decryptItem(key, item.id, item)).toMatchObject({ name: "Mail" });

    const all = await sync(c);
    expect(all.full).toBe(true);
    expect(all.items.map((i) => i.id)).toContain(item.id);
    expect(all.folders.map((f) => f.id)).toContain(folder.id);
    const since = all.revision;

    // Edit keeps the item key.
    const edited = crypto.encryptItem(key, item.id, loginData("Mail (work)"), item.encryptedKey);
    const put = await c.request("PUT", `/vault/items/${item.id}`, {
      folderId: folder.id,
      ...edited,
      expectedRevision: item.revision,
    });
    expect(put.statusCode).toBe(200);
    const updated = put.json<ItemResponse>().item;
    expect(updated.revision).toBeGreaterThan(item.revision);

    const delta = await sync(c, since);
    expect(delta.full).toBe(false);
    expect(delta.items.map((i) => i.id)).toEqual([item.id]);
    expect(delta.folders).toEqual([]);
    expect(crypto.decryptItem(key, item.id, delta.items[0] as VaultItem)).toMatchObject({
      name: "Mail (work)",
    });

    const trashed = await c.request("DELETE", `/vault/items/${item.id}`);
    expect(trashed.json<ItemResponse>().item.deletedAt).not.toBeNull();
    const afterTrash = await sync(c, delta.revision);
    expect(afterTrash.items[0]?.deletedAt).not.toBeNull();

    const restored = await c.request("POST", `/vault/items/${item.id}/restore`);
    expect(restored.json<ItemResponse>().item.deletedAt).toBeNull();

    const gone = await c.request("DELETE", `/vault/items/${item.id}/permanent`);
    expect(gone.statusCode).toBe(200);
    const afterPurge = await sync(c, afterTrash.revision);
    expect(afterPurge.deletedItemIds).toEqual([item.id]);
    expect(afterPurge.items.map((i) => i.id)).not.toContain(item.id);
  });

  it("deleting a folder moves its items to no folder and leaves a tombstone", async () => {
    const c = alice.client;
    const key = keyOf(alice);
    const folder = newFolder(key, "Temp");
    await c.request("POST", "/vault/folders", folder);
    const item = await create(c, newItem(key, loginData("In temp"), folder.id));
    const before = (await sync(c)).revision;

    const renamed = await c.request("PUT", `/vault/folders/${folder.id}`, {
      encryptedName: crypto.encryptFolderName(key, folder.id, "Temp 2"),
    });
    expect(renamed.statusCode).toBe(200);

    expect((await c.request("DELETE", `/vault/folders/${folder.id}`)).statusCode).toBe(200);
    const delta = await sync(c, before);
    expect(delta.deletedFolderIds).toEqual([folder.id]);
    expect(delta.items.find((i) => i.id === item.id)?.folderId).toBeNull();
  });

  it("a stale expectedRevision → 409 with the stored item", async () => {
    const c = alice.client;
    const key = keyOf(alice);
    const item = await create(c, newItem(key, loginData("Bank")));
    const body = (name: string, expectedRevision: number) => ({
      folderId: null,
      ...crypto.encryptItem(key, item.id, loginData(name), item.encryptedKey),
      expectedRevision,
    });

    const first = await c.request("PUT", `/vault/items/${item.id}`, body("Bank 1", item.revision));
    expect(first.statusCode).toBe(200);
    const stale = await c.request("PUT", `/vault/items/${item.id}`, body("Bank 2", item.revision));
    expect(stale.statusCode).toBe(409);
    const error = stale.json<{ error: { code: string; details: ItemConflictDetails } }>().error;
    expect(error.code).toBe("CONFLICT");
    expect(error.details.current.revision).toBe(first.json<ItemResponse>().item.revision);
    expect(crypto.decryptItem(key, item.id, error.details.current)).toMatchObject({
      name: "Bank 1",
    });

    // A trashed item can't be edited until it's restored.
    await c.request("DELETE", `/vault/items/${item.id}`);
    const current = error.details.current.revision;
    const trashed = await c.request("PUT", `/vault/items/${item.id}`, body("Bank 3", current));
    expect(trashed.statusCode).toBe(409);
  });

  it("a taken id → 409", async () => {
    const draft = newItem(keyOf(alice), loginData("Twice"));
    await create(alice.client, draft);
    const again = await alice.client.request("POST", "/vault/items", draft);
    expect(again.statusCode).toBe(409);
  });

  it("another user's item or folder is a 404, and never shows up in their sync", async () => {
    const key = keyOf(alice);
    const folder = newFolder(key, "Private");
    await alice.client.request("POST", "/vault/folders", folder);
    const item = await create(alice.client, newItem(key, loginData("Secret"), folder.id));
    const b = bob.client;

    const put = await b.request("PUT", `/vault/items/${item.id}`, {
      folderId: null,
      encryptedKey: item.encryptedKey,
      encryptedData: item.encryptedData,
      expectedRevision: item.revision,
    });
    expect(put.statusCode).toBe(404);
    expect((await b.request("DELETE", `/vault/items/${item.id}`)).statusCode).toBe(404);
    expect((await b.request("POST", `/vault/items/${item.id}/restore`)).statusCode).toBe(404);
    expect((await b.request("DELETE", `/vault/items/${item.id}/permanent`)).statusCode).toBe(404);
    expect((await b.request("DELETE", `/vault/folders/${folder.id}`)).statusCode).toBe(404);
    const rename = await b.request("PUT", `/vault/folders/${folder.id}`, {
      encryptedName: folder.encryptedName,
    });
    expect(rename.statusCode).toBe(404);

    // Bob can't file his own item into Alice's folder either.
    const intoHers = await b.request(
      "POST",
      "/vault/items",
      newItem(keyOf(bob), loginData("x"), folder.id),
    );
    expect(intoHers.statusCode).toBe(404);

    const bobs = await sync(b);
    expect(bobs.items.map((i) => i.id)).not.toContain(item.id);
    expect(bobs.folders.map((f) => f.id)).not.toContain(folder.id);

    const still = await sync(alice.client);
    expect(still.items.find((i) => i.id === item.id)?.revision).toBe(item.revision);
  });

  it("batch import is all or nothing", async () => {
    const c = alice.client;
    const key = keyOf(alice);
    const folder = newFolder(key, "Imported");
    const items = Array.from({ length: 50 }, (_, n) =>
      newItem(key, loginData(`Imported ${n}`), n % 2 === 0 ? folder.id : null),
    );

    const taken = await create(c, newItem(key, loginData("Already here")));
    const bad = await c.request("POST", "/vault/items/batch", {
      format: "csv",
      folders: [folder],
      items: [...items, { ...newItem(key, loginData("dup")), id: taken.id }],
    });
    expect(bad.statusCode).toBe(409);
    const afterBad = await sync(c);
    expect(afterBad.items.map((i) => i.id)).not.toContain(items[0]?.id);
    expect(afterBad.folders.map((f) => f.id)).not.toContain(folder.id);

    const unknownFolder = await c.request("POST", "/vault/items/batch", {
      format: "csv",
      items: [newItem(key, loginData("lost"), randomUUID())],
    });
    expect(unknownFolder.statusCode).toBe(404);

    const ok = await c.request("POST", "/vault/items/batch", {
      format: "bitwarden_json",
      folders: [folder],
      items,
    });
    expect(ok.statusCode, String(ok.body)).toBe(200);
    expect(ok.json<VaultBatchImportResponse>()).toMatchObject({ itemCount: 50, folderCount: 1 });

    const delta = await sync(c, afterBad.revision);
    expect(delta.items).toHaveLength(50);
    expect(delta.folders.map((f) => f.id)).toEqual([folder.id]);

    const audit = await h.prisma.auditLog.findFirst({
      where: { action: "vault.imported" },
      orderBy: { occurredAt: "desc" },
    });
    expect(audit?.metadata).toMatchObject({ format: "bitwarden_json", itemCount: 50 });
  });

  it("records an export in the audit log (format and count only)", async () => {
    const bad = await bob.client.request("POST", "/vault/exported", {
      format: "pdf",
      itemCount: 1,
    });
    expect(bad.statusCode).toBe(400);

    const res = await bob.client.request("POST", "/vault/exported", {
      format: "csv",
      itemCount: 3,
    });
    expect(res.statusCode, String(res.body)).toBe(200);
    const audit = await h.prisma.auditLog.findFirst({
      where: { action: "vault.exported" },
      orderBy: { occurredAt: "desc" },
    });
    expect(audit?.metadata).toMatchObject({ format: "csv", itemCount: 3 });
  });

  it("enforces blob size limits", async () => {
    const key = keyOf(alice);
    const draft = newItem(key, loginData("Big"));
    const tooBig = { ...draft, encryptedData: `v1.xc20p.${"A".repeat(70_000)}` };
    expect((await alice.client.request("POST", "/vault/items", tooBig)).statusCode).toBe(400);

    const huge = { ...draft, encryptedData: `v1.xc20p.${"A".repeat(200_000)}` };
    expect((await alice.client.request("POST", "/vault/items", huge)).statusCode).toBe(413);

    const notABlob = { ...draft, encryptedData: "plain text" };
    expect((await alice.client.request("POST", "/vault/items", notABlob)).statusCode).toBe(400);
  });

  it(
    "purge job: deletes items trashed > 30 days, tombstones them, prunes old tombstones",
    async () => {
      const c = bob.client;
      const key = keyOf(bob);
      const old = await create(c, newItem(key, loginData("Old")));
      const recent = await create(c, newItem(key, loginData("Recent")));
      await c.request("DELETE", `/vault/items/${old.id}`);
      await c.request("DELETE", `/vault/items/${recent.id}`);
      await h.prisma.vaultItem.update({
        where: { id: old.id },
        data: { deletedAt: new Date(Date.now() - 31 * DAY_MS) },
      });
      const before = (await sync(c)).revision;

      const result = await h.modules.vault.purgeExpired();
      expect(result.purged).toBeGreaterThanOrEqual(1);

      const delta = await sync(c, before);
      expect(delta.deletedItemIds).toEqual([old.id]);
      expect(await h.prisma.vaultItem.findUnique({ where: { id: recent.id } })).not.toBeNull();
      const audit = await h.prisma.auditLog.findFirst({
        where: { action: "item.purged", targetId: old.id },
      });
      expect(audit).toBeNull(); // job entries target the vault, with the ids in metadata
      const jobEntry = await h.prisma.auditLog.findFirst({
        where: { action: "item.purged", targetType: "vault" },
        orderBy: { occurredAt: "desc" },
      });
      expect(jobEntry?.metadata).toMatchObject({ reason: "trash_expired" });

      // Tombstones older than 90 days go; a sync from before them is now full.
      await h.prisma.vaultTombstone.updateMany({
        where: { objectId: old.id },
        data: { deletedAt: new Date(Date.now() - 91 * DAY_MS) },
      });
      const pruned = await h.modules.vault.purgeExpired();
      expect(pruned.tombstonesPruned).toBeGreaterThanOrEqual(1);
      expect((await sync(c, before)).full).toBe(true);
      expect((await sync(c, delta.revision)).full).toBe(false);
    },
    SLOW,
  );

  it("never stores or logs plaintext", async () => {
    const c = alice.client;
    const key = keyOf(alice);
    const folder = newFolder(key, MARKER);
    await c.request("POST", "/vault/folders", folder);
    const item = await create(c, newItem(key, loginData(MARKER, MARKER), folder.id));
    await c.request("PUT", `/vault/items/${item.id}`, {
      folderId: folder.id,
      ...crypto.encryptItem(key, item.id, loginData(MARKER, `${MARKER}-2`), item.encryptedKey),
      expectedRevision: item.revision,
    });

    const pattern = `%${MARKER}%`;
    const hits = await h.prisma.$queryRaw<{ n: number }[]>`
      SELECT (
        (SELECT count(*) FROM vault_items t WHERE row_to_json(t)::text LIKE ${pattern}) +
        (SELECT count(*) FROM folders t WHERE row_to_json(t)::text LIKE ${pattern}) +
        (SELECT count(*) FROM audit_log t WHERE row_to_json(t)::text LIKE ${pattern})
      )::int AS n`;
    expect(hits[0]?.n).toBe(0);
  });
});
