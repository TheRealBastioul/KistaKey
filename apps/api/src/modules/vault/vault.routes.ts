import {
  FolderCreateRequestSchema,
  type FolderResponse,
  FolderUpdateRequestSchema,
  IdParamsSchema,
  ItemCreateRequestSchema,
  type ItemResponse,
  ItemUpdateRequestSchema,
  type OkResponse,
  VAULT_LIMITS,
  VaultBatchImportRequestSchema,
  type VaultBatchImportResponse,
  VaultExportedRequestSchema,
  VaultSyncQuerySchema,
  type VaultSyncResponse,
} from "@repo/types";
import type { FastifyPluginAsync } from "fastify";
import { requestMeta } from "../../lib/http";
import { actorOf } from "../../plugins/auth";
import { byUser, rateLimits } from "../../plugins/rate-limit";
import type { VaultService } from "./vault.service";

const MINUTE = 60_000;
// Body caps sit just above the largest valid request, so oversized blobs are
// refused before parsing; the zod schemas then enforce each field's limit.
const ROW_OVERHEAD = 20_000;
const ITEM_BODY_LIMIT = VAULT_LIMITS.encryptedItemChars + ROW_OVERHEAD;
const FOLDER_BODY_LIMIT = ROW_OVERHEAD;
const IMPORT_BODY_LIMIT =
  VAULT_LIMITS.batchItems * ITEM_BODY_LIMIT + VAULT_LIMITS.batchFolders * FOLDER_BODY_LIMIT;

/** Personal vault. Every route needs a fully signed-in session (the default gate). */
export function vaultRoutes(vault: VaultService): FastifyPluginAsync {
  return async (app) => {
    const writeLimit = rateLimits(app, [
      { name: "vault-write-user", max: 300, windowMs: MINUTE, key: byUser },
    ]);
    const importLimit = rateLimits(app, [
      { name: "vault-import-user", max: 60, windowMs: 10 * MINUTE, key: byUser },
    ]);

    app.get("/vault/sync", async (req): Promise<VaultSyncResponse> => {
      const { since } = VaultSyncQuerySchema.parse(req.query);
      return vault.sync(actorOf(req).tenant, since);
    });

    app.post(
      "/vault/items",
      { preHandler: writeLimit, bodyLimit: ITEM_BODY_LIMIT },
      async (req): Promise<ItemResponse> => {
        const input = ItemCreateRequestSchema.parse(req.body);
        return { item: await vault.createItem(actorOf(req), input, requestMeta(req)) };
      },
    );

    app.post(
      "/vault/items/batch",
      { preHandler: importLimit, bodyLimit: IMPORT_BODY_LIMIT },
      async (req): Promise<VaultBatchImportResponse> => {
        const input = VaultBatchImportRequestSchema.parse(req.body);
        return vault.importBatch(actorOf(req), input, requestMeta(req));
      },
    );

    app.post(
      "/vault/exported",
      { preHandler: writeLimit, bodyLimit: FOLDER_BODY_LIMIT },
      async (req): Promise<OkResponse> => {
        const input = VaultExportedRequestSchema.parse(req.body);
        await vault.recordExport(actorOf(req), input, requestMeta(req));
        return { ok: true };
      },
    );

    app.put(
      "/vault/items/:id",
      { preHandler: writeLimit, bodyLimit: ITEM_BODY_LIMIT },
      async (req): Promise<ItemResponse> => {
        const { id } = IdParamsSchema.parse(req.params);
        const input = ItemUpdateRequestSchema.parse(req.body);
        return { item: await vault.updateItem(actorOf(req), id, input, requestMeta(req)) };
      },
    );

    app.delete(
      "/vault/items/:id",
      { preHandler: writeLimit },
      async (req): Promise<ItemResponse> => {
        const { id } = IdParamsSchema.parse(req.params);
        return { item: await vault.trashItem(actorOf(req), id, requestMeta(req)) };
      },
    );

    app.post(
      "/vault/items/:id/restore",
      { preHandler: writeLimit },
      async (req): Promise<ItemResponse> => {
        const { id } = IdParamsSchema.parse(req.params);
        return { item: await vault.restoreItem(actorOf(req), id, requestMeta(req)) };
      },
    );

    app.delete(
      "/vault/items/:id/permanent",
      { preHandler: writeLimit },
      async (req): Promise<OkResponse> => {
        const { id } = IdParamsSchema.parse(req.params);
        await vault.purgeItem(actorOf(req), id, requestMeta(req));
        return { ok: true };
      },
    );

    app.post(
      "/vault/folders",
      { preHandler: writeLimit, bodyLimit: FOLDER_BODY_LIMIT },
      async (req): Promise<FolderResponse> => {
        const input = FolderCreateRequestSchema.parse(req.body);
        return { folder: await vault.createFolder(actorOf(req), input, requestMeta(req)) };
      },
    );

    app.put(
      "/vault/folders/:id",
      { preHandler: writeLimit, bodyLimit: FOLDER_BODY_LIMIT },
      async (req): Promise<FolderResponse> => {
        const { id } = IdParamsSchema.parse(req.params);
        const { encryptedName } = FolderUpdateRequestSchema.parse(req.body);
        return {
          folder: await vault.renameFolder(actorOf(req), id, encryptedName, requestMeta(req)),
        };
      },
    );

    app.delete(
      "/vault/folders/:id",
      { preHandler: writeLimit },
      async (req): Promise<OkResponse> => {
        const { id } = IdParamsSchema.parse(req.params);
        await vault.deleteFolder(actorOf(req), id, requestMeta(req));
        return { ok: true };
      },
    );
  };
}
