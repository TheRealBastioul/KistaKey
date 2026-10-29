// Typed calls for the personal vault (Phase 7 API). Bodies carry only ids,
// metadata and encrypted blobs; the crypto worker makes them.
import {
  type FolderCreateRequest,
  FolderResponseSchema,
  type ItemCreateRequest,
  ItemResponseSchema,
  type ItemUpdateRequest,
  OkResponseSchema,
  type VaultBatchImportRequest,
  VaultBatchImportResponseSchema,
  type VaultExportedRequest,
  VaultSyncResponseSchema,
} from "@repo/types";
import { request } from "./client";

export const vaultApi = {
  /** No `since` = the whole vault. */
  sync: (since?: number) =>
    request("GET", since === undefined ? "/vault/sync" : `/vault/sync?since=${since}`, {
      schema: VaultSyncResponseSchema,
    }),

  createItem: (body: ItemCreateRequest) =>
    request("POST", "/vault/items", { body, schema: ItemResponseSchema }),

  /** Stale `expectedRevision` or trashed item → ApiError CONFLICT with `details.current`. */
  updateItem: (id: string, body: ItemUpdateRequest) =>
    request("PUT", `/vault/items/${id}`, { body, schema: ItemResponseSchema }),

  trashItem: (id: string) =>
    request("DELETE", `/vault/items/${id}`, { schema: ItemResponseSchema }),

  restoreItem: (id: string) =>
    request("POST", `/vault/items/${id}/restore`, { schema: ItemResponseSchema }),

  purgeItem: (id: string) =>
    request("DELETE", `/vault/items/${id}/permanent`, { schema: OkResponseSchema }),

  createFolder: (body: FolderCreateRequest) =>
    request("POST", "/vault/folders", { body, schema: FolderResponseSchema }),

  renameFolder: (id: string, encryptedName: string) =>
    request("PUT", `/vault/folders/${id}`, {
      body: { encryptedName },
      schema: FolderResponseSchema,
    }),

  /** Its items move to no folder. */
  deleteFolder: (id: string) =>
    request("DELETE", `/vault/folders/${id}`, { schema: OkResponseSchema }),

  /** One import chunk (≤ 500 items + folders), all or nothing. */
  importBatch: (body: VaultBatchImportRequest) =>
    request("POST", "/vault/items/batch", { body, schema: VaultBatchImportResponseSchema }),

  /** Audit only: the export itself never leaves the browser. */
  recordExport: (body: VaultExportedRequest) =>
    request("POST", "/vault/exported", { body, schema: OkResponseSchema }),
};
