// Vault export (decisions §21). Two formats, both built from the decrypted
// vault in memory; only live, readable items are exported.
//   Encrypted JSON: the export document encrypted under the user key in the
//     worker. Re-import only, into this same account.
//   CSV: plaintext in Bitwarden's CSV layout (so it re-imports here and into
//     most managers). Behind a warning and a master-password re-prompt.
import { formatOtpAuthUri } from "@repo/crypto/otpauth";
import { type ItemData, type ItemType, itemDataSchemaFor, VAULT_LIMITS } from "@repo/types";
import { toCsv } from "./import/csv";
import { ImportFormatError } from "./import/csvFormats";
import { emptyImport, type ParsedImport } from "./import/model";
import type { FolderEntry, VaultEntry } from "./store";

export const EXPORT_FORMAT = "vault-export";
export const ENCRYPTED_EXPORT_FORMAT = "vault-export-encrypted";
const VERSION = 1;

/** The plaintext document (never written to disk as is: it's encrypted first). */
export interface ExportDocument {
  format: typeof EXPORT_FORMAT;
  version: number;
  exportedAt: string;
  folders: { id: string; name: string }[];
  items: { type: ItemType; folderId: string | null; data: ItemData }[];
}

/** The .json file the user downloads. */
export interface EncryptedExportFile {
  format: typeof ENCRYPTED_EXPORT_FORMAT;
  version: number;
  exportedAt: string;
  /** The ExportDocument JSON, encrypted under the user key (`vault-export:v1`). */
  data: string;
}

export interface ExportSelection {
  items: { entry: VaultEntry; data: ItemData }[];
  folders: { id: string; name: string }[];
  /** Live items that couldn't be decrypted, left out. */
  unreadable: number;
}

export function selectForExport(items: VaultEntry[], folders: FolderEntry[]): ExportSelection {
  const live = items.filter((e) => e.deletedAt === null);
  const readable = live.flatMap((entry) => (entry.data ? [{ entry, data: entry.data }] : []));
  return {
    items: readable,
    folders: folders.flatMap((f) => (f.name === null ? [] : [{ id: f.id, name: f.name }])),
    unreadable: live.length - readable.length,
  };
}

export function exportDocument(selection: ExportSelection, now = new Date()): ExportDocument {
  const known = new Set(selection.folders.map((f) => f.id));
  return {
    format: EXPORT_FORMAT,
    version: VERSION,
    exportedAt: now.toISOString(),
    folders: selection.folders,
    items: selection.items.map(({ entry, data }) => ({
      type: entry.type,
      folderId: entry.folderId && known.has(entry.folderId) ? entry.folderId : null,
      data,
    })),
  };
}

export function encryptedExportFile(data: string, now = new Date()): EncryptedExportFile {
  return { format: ENCRYPTED_EXPORT_FORMAT, version: VERSION, exportedAt: now.toISOString(), data };
}

/** The `data` blob of an encrypted export file, or an ImportFormatError. */
export function readEncryptedExportFile(text: string): string {
  let file: unknown;
  try {
    file = JSON.parse(text);
  } catch {
    throw new ImportFormatError("This isn't an encrypted export (not valid JSON).");
  }
  const f = file as Partial<EncryptedExportFile> | null;
  if (f?.format !== ENCRYPTED_EXPORT_FORMAT || typeof f.data !== "string") {
    throw new ImportFormatError("This isn't an encrypted export from this app.");
  }
  if (f.version !== VERSION) {
    throw new ImportFormatError("This export was made by a newer version of the app.");
  }
  return f.data;
}

/** Decrypted ExportDocument JSON → items to import (validated like every import). */
export function parseExportDocument(json: string): ParsedImport {
  const doc = JSON.parse(json) as Partial<ExportDocument>;
  if (doc.format !== EXPORT_FORMAT || !Array.isArray(doc.items)) {
    throw new ImportFormatError("The export's contents aren't in the expected format.");
  }
  const folderNames = new Map((doc.folders ?? []).map((f) => [f.id, f.name]));
  const out = emptyImport();
  doc.items.forEach((item, index) => {
    const where = `Item ${index + 1}`;
    const type = item?.type;
    if (type !== "login" && type !== "note" && type !== "totp") {
      out.skipped.push({ where, message: "Unknown item type." });
      return;
    }
    const parsed = itemDataSchemaFor(type).safeParse(item.data);
    if (!parsed.success) {
      out.skipped.push({ where, message: parsed.error.issues[0]?.message ?? "Invalid item." });
      return;
    }
    const folder = item.folderId ? (folderNames.get(item.folderId) ?? null) : null;
    out.items.push({
      type,
      folder: folder ? folder.slice(0, VAULT_LIMITS.folderNameChars) : null,
      data: parsed.data,
    });
  });
  return out;
}

export const CSV_COLUMNS = [
  "folder",
  "favorite",
  "type",
  "name",
  "notes",
  "fields",
  "reprompt",
  "login_uri",
  "login_username",
  "login_password",
  "login_totp",
] as const;

/**
 * Bitwarden CSV layout. Authenticator-only items export as logins with a
 * TOTP; custom fields as "label: value" lines (hidden flag and password
 * history aren't representable in CSV).
 */
export function exportCsv(selection: ExportSelection): string {
  const folderNames = new Map(selection.folders.map((f) => [f.id, f.name]));
  const rows: string[][] = [[...CSV_COLUMNS]];
  for (const { entry, data } of selection.items) {
    const login = data.login;
    const totp = login?.totp
      ? formatOtpAuthUri({
          ...login.totp,
          issuer: data.name,
          account: login.username,
        })
      : "";
    rows.push([
      entry.folderId ? (folderNames.get(entry.folderId) ?? "") : "",
      data.favorite ? "1" : "",
      entry.type === "note" ? "note" : "login",
      data.name,
      data.note ?? "",
      data.customFields.map((f) => `${f.label}: ${f.value}`).join("\n"),
      "0",
      (login?.uris ?? []).map((u) => u.uri).join(","),
      login?.username ?? "",
      login?.password ?? "",
      totp,
    ]);
  }
  return toCsv(rows);
}

/** `<prefix>-vault-2026-10-28.<ext>` */
export function exportFileName(prefix: string, extension: string, now = new Date()): string {
  const slug =
    prefix
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "vault";
  return `${slug}-vault-${now.toISOString().slice(0, 10)}.${extension}`;
}
