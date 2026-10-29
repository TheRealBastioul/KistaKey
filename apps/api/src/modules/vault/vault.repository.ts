import type { ItemType } from "@repo/types";
import { tenantWhere, type UserTenant } from "../../db/tenant";
import type { DbHandles } from "../../db/types";
import type { Prisma } from "../../generated/prisma/client";

/** A transaction, or the client itself (PrismaClient is assignable to it). */
type Client = Prisma.TransactionClient;
type ObjectKind = "item" | "folder";

export interface NewItem {
  id: string;
  type: ItemType;
  folderId: string | null;
  encryptedKey: string;
  encryptedData: string;
}

export interface NewFolder {
  id: string;
  encryptedName: string;
}

export interface VaultStateRow {
  revision: number;
  tombstoneFloor: number;
}

/**
 * Queries used inside a vault write transaction. Every write starts with
 * bumpRevision, which locks the user's vault_state row until commit, so the
 * reads that follow are race-free and revisions commit in order.
 */
function vaultQueries(db: Client) {
  return {
    /** Locks the user's vault (row lock until commit) and returns the new revision. */
    async bumpRevision(tenant: UserTenant): Promise<number> {
      const state = await db.vaultState.upsert({
        where: tenantWhere(tenant),
        create: { ...tenantWhere(tenant), revision: 1 },
        update: { revision: { increment: 1 } },
        select: { revision: true },
      });
      return state.revision;
    },

    findItem(tenant: UserTenant, id: string) {
      return db.vaultItem.findFirst({ where: { ...tenantWhere(tenant), id } });
    },

    createItem(tenant: UserTenant, item: NewItem, revision: number) {
      return db.vaultItem.create({ data: { ...item, ...tenantWhere(tenant), revision } });
    },

    async createItems(tenant: UserTenant, items: NewItem[], revision: number): Promise<number> {
      const { count } = await db.vaultItem.createMany({
        data: items.map((item) => ({ ...item, ...tenantWhere(tenant), revision })),
      });
      return count;
    },

    updateItem(
      tenant: UserTenant,
      id: string,
      data: { folderId: string | null; encryptedKey: string; encryptedData: string },
      revision: number,
    ) {
      return db.vaultItem.update({
        where: { id, ...tenantWhere(tenant) },
        data: { ...data, revision },
      });
    },

    /** Trash (a date) or restore (null). */
    setItemDeleted(tenant: UserTenant, id: string, deletedAt: Date | null, revision: number) {
      return db.vaultItem.update({
        where: { id, ...tenantWhere(tenant) },
        data: { deletedAt, revision },
      });
    },

    async deleteItems(tenant: UserTenant, ids: string[]): Promise<number> {
      const { count } = await db.vaultItem.deleteMany({
        where: { ...tenantWhere(tenant), id: { in: ids } },
      });
      return count;
    },

    /** Of `ids`, the ones still in the trash since before `cutoff`. */
    async expiredTrash(tenant: UserTenant, ids: string[], cutoff: Date): Promise<string[]> {
      const rows = await db.vaultItem.findMany({
        where: { ...tenantWhere(tenant), id: { in: ids }, deletedAt: { lt: cutoff } },
        select: { id: true },
      });
      return rows.map((row) => row.id);
    },

    /** Moves the folder's items (trashed ones too) to no folder. Returns how many. */
    async clearFolder(tenant: UserTenant, folderId: string, revision: number): Promise<number> {
      const { count } = await db.vaultItem.updateMany({
        where: { ...tenantWhere(tenant), folderId },
        data: { folderId: null, revision },
      });
      return count;
    },

    findFolder(tenant: UserTenant, id: string) {
      return db.folder.findFirst({ where: { ...tenantWhere(tenant), id } });
    },

    /** How many of `ids` are folders of this user. */
    countFolders(tenant: UserTenant, ids: string[]): Promise<number> {
      return db.folder.count({ where: { ...tenantWhere(tenant), id: { in: ids } } });
    },

    createFolder(tenant: UserTenant, folder: NewFolder, revision: number) {
      return db.folder.create({ data: { ...folder, ...tenantWhere(tenant), revision } });
    },

    async createFolders(tenant: UserTenant, folders: NewFolder[], revision: number) {
      const { count } = await db.folder.createMany({
        data: folders.map((folder) => ({ ...folder, ...tenantWhere(tenant), revision })),
      });
      return count;
    },

    updateFolder(tenant: UserTenant, id: string, encryptedName: string, revision: number) {
      return db.folder.update({
        where: { id, ...tenantWhere(tenant) },
        data: { encryptedName, revision },
      });
    },

    deleteFolder(tenant: UserTenant, id: string) {
      return db.folder.delete({ where: { id, ...tenantWhere(tenant) } });
    },

    /** Records permanent deletes for sync (replacing any older tombstone of the same id). */
    async addTombstones(tenant: UserTenant, kind: ObjectKind, ids: string[], revision: number) {
      if (ids.length === 0) return;
      await db.vaultTombstone.deleteMany({
        where: { ...tenantWhere(tenant), kind, objectId: { in: ids } },
      });
      await db.vaultTombstone.createMany({
        data: ids.map((objectId) => ({ ...tenantWhere(tenant), kind, objectId, revision })),
      });
    },

    /** An id that comes back (re-created after a permanent delete) is no longer deleted. */
    async clearTombstones(tenant: UserTenant, kind: ObjectKind, ids: string[]) {
      if (ids.length === 0) return;
      await db.vaultTombstone.deleteMany({
        where: { ...tenantWhere(tenant), kind, objectId: { in: ids } },
      });
    },
  };
}

export type VaultQueries = ReturnType<typeof vaultQueries>;

// Sync reads the writer: a client syncing right after its own write must see
// it (a stale replica would drop it from a full sync until the next one).
export function createVaultRepository({ writer }: DbHandles) {
  return {
    /** Runs `fn` in one transaction; any throw rolls the whole write back. */
    transaction<T>(fn: (q: VaultQueries) => Promise<T>, opts: { timeoutMs?: number } = {}) {
      return writer.$transaction((tx) => fn(vaultQueries(tx)), {
        timeout: opts.timeoutMs ?? 5_000,
      });
    },

    /**
     * One consistent snapshot (REPEATABLE READ) of the vault state and
     * everything changed after the revision `sinceFor(state)` picks
     * (null = everything, without tombstones).
     */
    snapshot(tenant: UserTenant, sinceFor: (state: VaultStateRow) => number | null) {
      return writer.$transaction(
        async (tx) => {
          const row = await tx.vaultState.findUnique({ where: tenantWhere(tenant) });
          const state = { revision: row?.revision ?? 0, tombstoneFloor: row?.tombstoneFloor ?? 0 };
          const since = sinceFor(state);
          const changed = since === null ? {} : { revision: { gt: since } };
          const order = { revision: "asc" } as const;
          const items = await tx.vaultItem.findMany({
            where: { ...tenantWhere(tenant), ...changed },
            orderBy: order,
          });
          const folders = await tx.folder.findMany({
            where: { ...tenantWhere(tenant), ...changed },
            orderBy: order,
          });
          const tombstones: { kind: ObjectKind; objectId: string }[] =
            since === null
              ? []
              : await tx.vaultTombstone.findMany({
                  where: { ...tenantWhere(tenant), ...changed },
                  select: { kind: true, objectId: true },
                  orderBy: order,
                });
          return { state, since, items, folders, tombstones };
        },
        { isolationLevel: "RepeatableRead" },
      );
    },

    // --- Maintenance (worker): across all users, never from a request ---

    /** Oldest trashed items past `cutoff`, for the purge job to take user by user. */
    findExpiredTrash(cutoff: Date, limit: number) {
      return writer.vaultItem.findMany({
        where: { deletedAt: { lt: cutoff } },
        select: { id: true, userId: true },
        orderBy: { deletedAt: "asc" },
        take: limit,
      });
    },

    /**
     * Deletes tombstones older than `cutoff` and raises each affected user's
     * tombstone_floor to the highest revision pruned. Returns how many went.
     */
    async pruneTombstones(cutoff: Date): Promise<number> {
      const rows = await writer.$queryRaw<{ count: number }[]>`
        WITH pruned AS (
          DELETE FROM vault_tombstones WHERE deleted_at < ${cutoff}
          RETURNING user_id, revision
        ), floors AS (
          UPDATE vault_state s
          SET tombstone_floor = GREATEST(s.tombstone_floor, p.max_revision)
          FROM (SELECT user_id, MAX(revision) AS max_revision FROM pruned GROUP BY user_id) p
          WHERE s.user_id = p.user_id
          RETURNING 1
        )
        SELECT COUNT(*)::int AS count FROM pruned`;
      return rows[0]?.count ?? 0;
    },
  };
}

export type VaultRepository = ReturnType<typeof createVaultRepository>;
