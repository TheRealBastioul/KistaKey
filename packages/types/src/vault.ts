// Personal vault: items, folders, sync, batch import. ref/decisions.md §15.
//
// Two layers:
// - Wire schemas (VaultItem, requests, sync): what the API sees. Only ids,
//   type, folder, revision, timestamps and encrypted blobs.
// - ItemData: the decrypted item, client-side only. It's the JSON inside
//   `encryptedData`; clients validate it after decrypting and before
//   encrypting. The server never sees it.
import { z } from "zod";
import { ENCRYPTED_BLOB_PATTERN, EncryptedBlobSchema, IsoDateSchema } from "./common";

/** Limits only ever grow: lowering one could make stored items invalid. */
export const VAULT_LIMITS = {
  /** Length of `encryptedData` (≈ 48 KB of item JSON after base64url). */
  encryptedItemChars: 65_536,
  nameChars: 512,
  usernameChars: 512,
  passwordChars: 4096,
  uris: 20,
  uriChars: 2048,
  noteChars: 10_000,
  customFields: 20,
  customFieldLabelChars: 64,
  customFieldValueChars: 4096,
  passwordHistory: 5,
  folderNameChars: 128,
  batchItems: 500,
  batchFolders: 500,
} as const;

export const VAULT_RETENTION = {
  /** Trashed items are purged this long after `deletedAt`. */
  trashDays: 30,
  /** Tombstones of permanent deletes are kept this long; older syncs get `full`. */
  tombstoneDays: 90,
} as const;

export const ITEM_TYPES = ["login", "note", "totp"] as const;
export const ItemTypeSchema = z.enum(ITEM_TYPES);
export type ItemType = z.infer<typeof ItemTypeSchema>;

// ---------------------------------------------------------------------------
// Decrypted item data (client-side only)
// ---------------------------------------------------------------------------
// Objects are loose: fields a newer client added survive an edit by an older
// client instead of being silently dropped.

/** Same bounds as @repo/crypto's TOTP_LIMITS. `secret` is normalized base32. */
export const TotpConfigSchema = z.looseObject({
  secret: z
    .string()
    .min(2)
    .max(205)
    .regex(/^[A-Z2-7]+$/, "expected a base32 secret"),
  algorithm: z.enum(["SHA1", "SHA256", "SHA512"]),
  digits: z.number().int().min(6).max(8),
  period: z.number().int().min(1).max(300),
});
export type TotpConfig = z.infer<typeof TotpConfigSchema>;

/** A site the login belongs to. Free text (users type "example.com"); autofill parses it. */
export const ItemUriSchema = z.looseObject({
  uri: z.string().min(1).max(VAULT_LIMITS.uriChars),
});
export type ItemUri = z.infer<typeof ItemUriSchema>;

export const LoginDataSchema = z.looseObject({
  username: z.string().max(VAULT_LIMITS.usernameChars).default(""),
  password: z.string().max(VAULT_LIMITS.passwordChars).default(""),
  uris: z.array(ItemUriSchema).max(VAULT_LIMITS.uris).default([]),
  totp: TotpConfigSchema.optional(),
});
export type LoginData = z.infer<typeof LoginDataSchema>;

export const CustomFieldSchema = z.looseObject({
  id: z.uuid(),
  label: z.string().min(1).max(VAULT_LIMITS.customFieldLabelChars),
  value: z.string().max(VAULT_LIMITS.customFieldValueChars),
  /** Masked in the UI like a password. */
  hidden: z.boolean(),
});
export type CustomField = z.infer<typeof CustomFieldSchema>;

/** A previous password, newest first; kept inside the encrypted item. */
export const PasswordHistoryEntrySchema = z.looseObject({
  password: z.string().max(VAULT_LIMITS.passwordChars),
  changedAt: IsoDateSchema,
});
export type PasswordHistoryEntry = z.infer<typeof PasswordHistoryEntrySchema>;

/** Every item field that isn't plaintext metadata. The JSON inside `encryptedData`. */
export const ItemDataSchema = z.looseObject({
  name: z.string().min(1).max(VAULT_LIMITS.nameChars),
  favorite: z.boolean().default(false),
  /** login and totp items (a totp item uses `username` as the account and `totp`). */
  login: LoginDataSchema.optional(),
  /** The body of a note item; extra notes on any other type. */
  note: z.string().max(VAULT_LIMITS.noteChars).optional(),
  customFields: z.array(CustomFieldSchema).max(VAULT_LIMITS.customFields).default([]),
  passwordHistory: z
    .array(PasswordHistoryEntrySchema)
    .max(VAULT_LIMITS.passwordHistory)
    .default([]),
});
export type ItemData = z.infer<typeof ItemDataSchema>;
export type ItemDataInput = z.input<typeof ItemDataSchema>;

/** ItemDataSchema plus what the item's type requires. */
export function itemDataSchemaFor(type: ItemType) {
  return ItemDataSchema.superRefine((data, ctx) => {
    if (type === "login" && !data.login) {
      ctx.addIssue({ code: "custom", path: ["login"], message: "login details are required" });
    }
    if (type === "note" && data.note === undefined) {
      ctx.addIssue({ code: "custom", path: ["note"], message: "a note is required" });
    }
    if (type === "totp" && !data.login?.totp) {
      ctx.addIssue({
        code: "custom",
        path: ["login", "totp"],
        message: "a TOTP secret is required",
      });
    }
  });
}

/** A folder name as typed, before encryptFolderName. */
export const FolderNameSchema = z.string().trim().min(1).max(VAULT_LIMITS.folderNameChars);

// ---------------------------------------------------------------------------
// Wire format (API)
// ---------------------------------------------------------------------------

/** The item-data blob: same format as every blob, bigger cap. */
export const EncryptedItemDataSchema = z
  .string()
  .max(VAULT_LIMITS.encryptedItemChars)
  .regex(ENCRYPTED_BLOB_PATTERN, "expected an encrypted blob");

export const VaultItemSchema = z.object({
  id: z.uuid(),
  type: ItemTypeSchema,
  folderId: z.uuid().nullable(),
  /** Item key wrapped by the user key, bound to the item id. */
  encryptedKey: EncryptedBlobSchema,
  /** ItemData JSON encrypted with the item key, bound to the item id. */
  encryptedData: EncryptedItemDataSchema,
  /** Vault revision of the item's last change; send it back as `expectedRevision`. */
  revision: z.number().int().nonnegative(),
  createdAt: IsoDateSchema,
  updatedAt: IsoDateSchema,
  /** Set while the item is in the trash. */
  deletedAt: IsoDateSchema.nullable(),
});
export type VaultItem = z.infer<typeof VaultItemSchema>;

export const FolderSchema = z.object({
  id: z.uuid(),
  /** Folder name encrypted with the user key, bound to the folder id. */
  encryptedName: EncryptedBlobSchema,
  revision: z.number().int().nonnegative(),
  createdAt: IsoDateSchema,
  updatedAt: IsoDateSchema,
});
export type Folder = z.infer<typeof FolderSchema>;

/**
 * POST /vault/items. The client picks the id (random UUID), because the id is
 * bound into the encryption before the server ever sees the item.
 */
export const ItemCreateRequestSchema = z.object({
  id: z.uuid(),
  type: ItemTypeSchema,
  folderId: z.uuid().nullable().default(null),
  encryptedKey: EncryptedBlobSchema,
  encryptedData: EncryptedItemDataSchema,
});
export type ItemCreateRequest = z.infer<typeof ItemCreateRequestSchema>;

/** PUT /vault/items/:id. Type can't change. Stale `expectedRevision` → 409 CONFLICT. */
export const ItemUpdateRequestSchema = z.object({
  folderId: z.uuid().nullable(),
  encryptedKey: EncryptedBlobSchema,
  encryptedData: EncryptedItemDataSchema,
  expectedRevision: z.number().int().nonnegative(),
});
export type ItemUpdateRequest = z.infer<typeof ItemUpdateRequestSchema>;

/** Create, update, trash and restore all answer with the item as stored. */
export const ItemResponseSchema = z.object({ item: VaultItemSchema });
export type ItemResponse = z.infer<typeof ItemResponseSchema>;

/** `error.details` of a 409 on update: the item as it is now, for the conflict dialog. */
export const ItemConflictDetailsSchema = z.object({ current: VaultItemSchema });
export type ItemConflictDetails = z.infer<typeof ItemConflictDetailsSchema>;

/** POST /vault/folders (client-picked id, like items). */
export const FolderCreateRequestSchema = z.object({
  id: z.uuid(),
  encryptedName: EncryptedBlobSchema,
});
export type FolderCreateRequest = z.infer<typeof FolderCreateRequestSchema>;

/** PUT /vault/folders/:id (rename; last write wins). */
export const FolderUpdateRequestSchema = z.object({ encryptedName: EncryptedBlobSchema });
export type FolderUpdateRequest = z.infer<typeof FolderUpdateRequestSchema>;

export const FolderResponseSchema = z.object({ folder: FolderSchema });
export type FolderResponse = z.infer<typeof FolderResponseSchema>;

/** GET /vault/sync?since=<revision>. No `since` = everything. */
export const VaultSyncQuerySchema = z.object({
  since: z.coerce.number().int().nonnegative().optional(),
});
export type VaultSyncQuery = z.infer<typeof VaultSyncQuerySchema>;

export const VaultSyncResponseSchema = z.object({
  /** Current vault revision; the next sync sends it as `since`. */
  revision: z.number().int().nonnegative(),
  /**
   * true: this is the whole vault (no `since`, or the server no longer has
   * tombstones that old), so the client replaces its copy instead of merging.
   */
  full: z.boolean(),
  /** Items changed after `since`, trashed ones included (`deletedAt` set). */
  items: z.array(VaultItemSchema),
  folders: z.array(FolderSchema),
  /** Tombstones: permanently deleted after `since`. */
  deletedItemIds: z.array(z.uuid()),
  deletedFolderIds: z.array(z.uuid()),
});
export type VaultSyncResponse = z.infer<typeof VaultSyncResponseSchema>;

function uniqueIds(rows: { id: string }[]): boolean {
  return new Set(rows.map((row) => row.id.toLowerCase())).size === rows.length;
}

/**
 * POST /vault/items/batch: one import chunk, all or nothing. Items may point
 * at folders created in the same batch. `format` is the import source,
 * recorded in the audit log.
 */
export const VaultBatchImportRequestSchema = z.object({
  format: z.string().regex(/^[a-z0-9_-]{1,32}$/, "expected an import format id"),
  folders: z
    .array(FolderCreateRequestSchema)
    .max(VAULT_LIMITS.batchFolders)
    .default([])
    .refine(uniqueIds, "folder ids must be unique"),
  items: z
    .array(ItemCreateRequestSchema)
    .min(1)
    .max(VAULT_LIMITS.batchItems)
    .refine(uniqueIds, "item ids must be unique"),
});
export type VaultBatchImportRequest = z.infer<typeof VaultBatchImportRequestSchema>;

export const VaultBatchImportResponseSchema = z.object({
  revision: z.number().int().nonnegative(),
  itemCount: z.number().int().nonnegative(),
  folderCount: z.number().int().nonnegative(),
});
export type VaultBatchImportResponse = z.infer<typeof VaultBatchImportResponseSchema>;

/** Export formats the web app offers (Phase 12). */
export const VAULT_EXPORT_FORMATS = ["encrypted_json", "csv"] as const;

/**
 * POST /vault/exported: audit only. The export is built and saved in the
 * browser; the server learns the format and count, never the contents.
 */
export const VaultExportedRequestSchema = z.object({
  format: z.enum(VAULT_EXPORT_FORMATS),
  itemCount: z.number().int().nonnegative().max(1_000_000),
});
export type VaultExportedRequest = z.infer<typeof VaultExportedRequestSchema>;
