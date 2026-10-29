// Personal vault (decisions §15, §16): encrypted items + folders, sync by a
// per-user revision, optimistic concurrency per item, trash, batch import.
// The server only ever stores and returns blobs; it can't read any of them.
import {
  type Folder,
  type FolderCreateRequest,
  type ItemCreateRequest,
  type ItemUpdateRequest,
  VAULT_RETENTION,
  type VaultBatchImportRequest,
  type VaultBatchImportResponse,
  type VaultExportedRequest,
  type VaultItem,
  type VaultSyncResponse,
} from "@repo/types";
import { isUniqueViolation } from "../../db/errors";
import { type UserTenant, userTenant } from "../../db/tenant";
import type { Folder as FolderRow, VaultItem as VaultItemRow } from "../../generated/prisma/client";
import { type Actor, auditActor } from "../../lib/actor";
import { conflict, notFound } from "../../lib/errors";
import type { RequestMeta } from "../../lib/http";
import type { AuditService } from "../audit";
import type { VaultQueries, VaultRepository, VaultStateRow } from "./vault.repository";

const DAY_MS = 24 * 60 * 60 * 1000;
/** Trashed items the purge job takes per round. */
const PURGE_BATCH = 500;
/** A 500-item import writes up to ~33 MB in one transaction. */
const IMPORT_TIMEOUT_MS = 30_000;

export function itemToWire(row: VaultItemRow): VaultItem {
  return {
    id: row.id,
    type: row.type,
    folderId: row.folderId,
    encryptedKey: row.encryptedKey,
    encryptedData: row.encryptedData,
    revision: row.revision,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: row.deletedAt?.toISOString() ?? null,
  };
}

export function folderToWire(row: FolderRow): Folder {
  return {
    id: row.id,
    encryptedName: row.encryptedName,
    revision: row.revision,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * The revision to send changes after, or null for the whole vault: no
 * `since`, one older than the oldest tombstone kept (a delete could be
 * missing), or one from the future (the client's copy isn't this vault's).
 */
export function syncSince(since: number | undefined, state: VaultStateRow): number | null {
  if (since === undefined || since < state.tombstoneFloor || since > state.revision) return null;
  return since;
}

function idTaken(err: unknown): never {
  if (isUniqueViolation(err)) throw conflict("That id is already taken");
  throw err;
}

/** Told after every committed write (the realtime hub, decisions §19). */
export interface VaultEvents {
  vaultChanged(userId: string, revision: number): void;
}

export function createVaultService(
  repo: VaultRepository,
  audit: AuditService,
  events: VaultEvents,
) {
  /**
   * One vault write: locks the vault and takes the next revision, runs `fn`
   * in the same transaction, then (after commit) announces the revision.
   */
  async function write<T>(
    tenant: UserTenant,
    fn: (q: VaultQueries, revision: number) => Promise<T>,
    opts?: { timeoutMs?: number },
  ): Promise<T> {
    let revision = 0;
    const result = await repo.transaction(async (q) => {
      revision = await q.bumpRevision(tenant);
      return fn(q, revision);
    }, opts);
    events.vaultChanged(tenant.userId, revision);
    return result;
  }

  async function requireFolder(q: VaultQueries, tenant: UserTenant, folderId: string | null) {
    if (folderId !== null && (await q.countFolders(tenant, [folderId])) === 0) {
      throw notFound("Folder not found");
    }
  }

  async function requireItem(q: VaultQueries, tenant: UserTenant, id: string) {
    const item = await q.findItem(tenant, id);
    if (!item) throw notFound("Item not found");
    return item;
  }

  function recordItem(
    actor: Actor,
    action: string,
    item: { id: string; type: string },
    request: RequestMeta,
    metadata: Record<string, unknown> = {},
  ) {
    return audit.record({
      action,
      actor: auditActor(actor),
      target: { type: "item", id: item.id },
      request,
      metadata: { type: item.type, ...metadata },
    });
  }

  function recordFolder(
    actor: Actor,
    action: string,
    folderId: string,
    request: RequestMeta,
    metadata: Record<string, unknown> = {},
  ) {
    return audit.record({
      action,
      actor: auditActor(actor),
      target: { type: "folder", id: folderId },
      request,
      metadata,
    });
  }

  return {
    async sync(tenant: UserTenant, since: number | undefined): Promise<VaultSyncResponse> {
      const snap = await repo.snapshot(tenant, (state) => syncSince(since, state));
      return {
        revision: snap.state.revision,
        full: snap.since === null,
        items: snap.items.map(itemToWire),
        folders: snap.folders.map(folderToWire),
        deletedItemIds: snap.tombstones.filter((t) => t.kind === "item").map((t) => t.objectId),
        deletedFolderIds: snap.tombstones.filter((t) => t.kind === "folder").map((t) => t.objectId),
      };
    },

    async createItem(
      actor: Actor,
      input: ItemCreateRequest,
      request: RequestMeta,
    ): Promise<VaultItem> {
      const row = await write(actor.tenant, async (q, revision) => {
        await requireFolder(q, actor.tenant, input.folderId);
        await q.clearTombstones(actor.tenant, "item", [input.id]);
        return q.createItem(actor.tenant, input, revision);
      }).catch(idTaken);
      await recordItem(actor, "item.created", row, request);
      return itemToWire(row);
    },

    /** Stale `expectedRevision` → 409 with the stored item in `details.current`. */
    async updateItem(
      actor: Actor,
      id: string,
      input: ItemUpdateRequest,
      request: RequestMeta,
    ): Promise<VaultItem> {
      const row = await write(actor.tenant, async (q, revision) => {
        const current = await requireItem(q, actor.tenant, id);
        if (current.deletedAt) {
          throw conflict("Restore the item before editing it", { current: itemToWire(current) });
        }
        if (current.revision !== input.expectedRevision) {
          throw conflict("The item was changed somewhere else", { current: itemToWire(current) });
        }
        await requireFolder(q, actor.tenant, input.folderId);
        return q.updateItem(
          actor.tenant,
          id,
          {
            folderId: input.folderId,
            encryptedKey: input.encryptedKey,
            encryptedData: input.encryptedData,
          },
          revision,
        );
      });
      await recordItem(actor, "item.updated", row, request);
      return itemToWire(row);
    },

    /** Moves the item to the trash. Already trashed: returned unchanged. */
    async trashItem(actor: Actor, id: string, request: RequestMeta): Promise<VaultItem> {
      const { row, changed } = await write(actor.tenant, async (q, revision) => {
        const current = await requireItem(q, actor.tenant, id);
        if (current.deletedAt) return { row: current, changed: false };
        return {
          row: await q.setItemDeleted(actor.tenant, id, new Date(), revision),
          changed: true,
        };
      });
      if (changed) await recordItem(actor, "item.deleted", row, request);
      return itemToWire(row);
    },

    /** Takes the item out of the trash. Not trashed: returned unchanged. */
    async restoreItem(actor: Actor, id: string, request: RequestMeta): Promise<VaultItem> {
      const { row, changed } = await write(actor.tenant, async (q, revision) => {
        const current = await requireItem(q, actor.tenant, id);
        if (!current.deletedAt) return { row: current, changed: false };
        return { row: await q.setItemDeleted(actor.tenant, id, null, revision), changed: true };
      });
      if (changed) await recordItem(actor, "item.restored", row, request);
      return itemToWire(row);
    },

    /** Deletes the item for good (trashed or not) and leaves a tombstone for sync. */
    async purgeItem(actor: Actor, id: string, request: RequestMeta): Promise<void> {
      const row = await write(actor.tenant, async (q, revision) => {
        const current = await requireItem(q, actor.tenant, id);
        await q.deleteItems(actor.tenant, [id]);
        await q.addTombstones(actor.tenant, "item", [id], revision);
        return current;
      });
      await recordItem(actor, "item.purged", row, request, { reason: "user" });
    },

    /**
     * One import chunk, all or nothing. Items may use folders from the same
     * batch or existing ones of this user; any taken id fails the batch.
     */
    async importBatch(
      actor: Actor,
      input: VaultBatchImportRequest,
      request: RequestMeta,
    ): Promise<VaultBatchImportResponse> {
      const result = await write(
        actor.tenant,
        async (q, revision) => {
          const batchFolders = new Set(input.folders.map((f) => f.id.toLowerCase()));
          const existing = [
            ...new Set(
              input.items
                .map((item) => item.folderId?.toLowerCase())
                .filter((id): id is string => id !== undefined && !batchFolders.has(id)),
            ),
          ];
          if ((await q.countFolders(actor.tenant, existing)) !== existing.length) {
            throw notFound("Folder not found");
          }
          await q.clearTombstones(
            actor.tenant,
            "folder",
            input.folders.map((f) => f.id),
          );
          await q.clearTombstones(
            actor.tenant,
            "item",
            input.items.map((item) => item.id),
          );
          const folderCount =
            input.folders.length > 0
              ? await q.createFolders(actor.tenant, input.folders, revision)
              : 0;
          const itemCount = await q.createItems(actor.tenant, input.items, revision);
          return { revision, itemCount, folderCount };
        },
        { timeoutMs: IMPORT_TIMEOUT_MS },
      ).catch(idTaken);
      await audit.record({
        action: "vault.imported",
        actor: auditActor(actor),
        target: { type: "vault", id: actor.userId },
        request,
        metadata: {
          format: input.format,
          itemCount: result.itemCount,
          folderCount: result.folderCount,
        },
      });
      return result;
    },

    /** Audit only: the export was built and saved in the browser. */
    async recordExport(
      actor: Actor,
      input: VaultExportedRequest,
      request: RequestMeta,
    ): Promise<void> {
      await audit.record({
        action: "vault.exported",
        actor: auditActor(actor),
        target: { type: "vault", id: actor.userId },
        request,
        metadata: { format: input.format, itemCount: input.itemCount },
      });
    },

    async createFolder(
      actor: Actor,
      input: FolderCreateRequest,
      request: RequestMeta,
    ): Promise<Folder> {
      const row = await write(actor.tenant, async (q, revision) => {
        await q.clearTombstones(actor.tenant, "folder", [input.id]);
        return q.createFolder(actor.tenant, input, revision);
      }).catch(idTaken);
      await recordFolder(actor, "folder.created", row.id, request);
      return folderToWire(row);
    },

    /** Rename; last write wins. */
    async renameFolder(
      actor: Actor,
      id: string,
      encryptedName: string,
      request: RequestMeta,
    ): Promise<Folder> {
      const row = await write(actor.tenant, async (q, revision) => {
        if (!(await q.findFolder(actor.tenant, id))) throw notFound("Folder not found");
        return q.updateFolder(actor.tenant, id, encryptedName, revision);
      });
      await recordFolder(actor, "folder.updated", id, request);
      return folderToWire(row);
    },

    /** Deletes the folder; its items move to no folder (and show up in the next sync). */
    async deleteFolder(actor: Actor, id: string, request: RequestMeta): Promise<void> {
      const itemsMoved = await write(actor.tenant, async (q, revision) => {
        if (!(await q.findFolder(actor.tenant, id))) throw notFound("Folder not found");
        const moved = await q.clearFolder(actor.tenant, id, revision);
        await q.deleteFolder(actor.tenant, id);
        await q.addTombstones(actor.tenant, "folder", [id], revision);
        return moved;
      });
      await recordFolder(actor, "folder.deleted", id, request, { itemsMoved });
    },

    /**
     * Job vault.purge-trash: deletes items trashed more than 30 days ago (user
     * by user, each in its own transaction with tombstones), then prunes
     * tombstones older than 90 days.
     */
    async purgeExpired(now = new Date()): Promise<{ purged: number; tombstonesPruned: number }> {
      const cutoff = new Date(now.getTime() - VAULT_RETENTION.trashDays * DAY_MS);
      let purged = 0;
      for (;;) {
        const rows = await repo.findExpiredTrash(cutoff, PURGE_BATCH);
        const byUser = new Map<string, string[]>();
        for (const row of rows) byUser.set(row.userId, [...(byUser.get(row.userId) ?? []), row.id]);

        for (const [userId, ids] of byUser) {
          const tenant = userTenant(userId);
          const gone = await write(tenant, async (q, revision) => {
            // Re-checked under the vault lock: one may have been restored since.
            const expired = await q.expiredTrash(tenant, ids, cutoff);
            await q.deleteItems(tenant, expired);
            await q.addTombstones(tenant, "item", expired, revision);
            return expired;
          });
          if (gone.length === 0) continue;
          purged += gone.length;
          await audit.record({
            action: "item.purged",
            actor: { userId },
            target: { type: "vault", id: userId },
            metadata: { reason: "trash_expired", count: gone.length, itemIds: gone },
          });
        }
        if (rows.length < PURGE_BATCH) break;
      }

      const tombstoneCutoff = new Date(now.getTime() - VAULT_RETENTION.tombstoneDays * DAY_MS);
      const tombstonesPruned = await repo.pruneTombstones(tombstoneCutoff);
      return { purged, tombstonesPruned };
    },
  };
}

export type VaultService = ReturnType<typeof createVaultService>;
