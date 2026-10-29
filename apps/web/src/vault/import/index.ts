// Import formats and the upload plan (decisions §21). Parsing happens here
// in the browser; the server only ever gets encrypted batches
// (POST /vault/items/batch, ≤ 500 items each, all or nothing per batch).
import { type ItemData, type ItemType, VAULT_LIMITS } from "@repo/types";
import type { FolderEntry } from "../store";
import {
  parseBitwardenCsv,
  parseGenericCsv,
  parseLastPassCsv,
  parseOnePasswordCsv,
} from "./csvFormats";
import { parseBitwardenJson, parseOnePassword1pux } from "./jsonFormats";
import type { ImportedItem, ParsedImport } from "./model";

export { ImportFormatError } from "./csvFormats";
export type { ImportedItem, ImportProblem, ParsedImport } from "./model";

export type ImportFormatId =
  | "bitwarden_json"
  | "bitwarden_csv"
  | "onepassword_1pux"
  | "onepassword_csv"
  | "lastpass_csv"
  | "generic_csv"
  | "encrypted_export";

export interface ImportFormat {
  id: ImportFormatId;
  label: string;
  /** File input `accept`. */
  accept: string;
  /** Read the file as bytes (zip) instead of text. */
  binary: boolean;
  help: string;
}

export const IMPORT_FORMATS: ImportFormat[] = [
  {
    id: "bitwarden_json",
    label: "Bitwarden (.json)",
    accept: ".json,application/json",
    binary: false,
    help: "Bitwarden → Tools → Export vault → File format: .json (not the encrypted one).",
  },
  {
    id: "bitwarden_csv",
    label: "Bitwarden (.csv)",
    accept: ".csv,text/csv",
    binary: false,
    help: "Bitwarden → Tools → Export vault → File format: .csv. Also reads this app's CSV export.",
  },
  {
    id: "onepassword_1pux",
    label: "1Password (.1pux)",
    accept: ".1pux",
    binary: true,
    help: "1Password 8 → File → Export → choose the account → 1PUX.",
  },
  {
    id: "onepassword_csv",
    label: "1Password (.csv)",
    accept: ".csv,text/csv",
    binary: false,
    help: "1Password → File → Export → CSV.",
  },
  {
    id: "lastpass_csv",
    label: "LastPass (.csv)",
    accept: ".csv,text/csv",
    binary: false,
    help: "LastPass → Advanced options → Export → save the CSV.",
  },
  {
    id: "generic_csv",
    label: "Other (.csv)",
    accept: ".csv,text/csv",
    binary: false,
    help: "Any CSV with a header row. Recognized columns: name/title, url, username, password, notes, folder, totp, favorite.",
  },
  {
    id: "encrypted_export",
    label: "Encrypted backup from this app (.json)",
    accept: ".json,application/json",
    binary: false,
    help: "An encrypted export made from this same account.",
  },
];

/** Every format but the encrypted backup (that one needs the worker: see ImportSection). */
export function parseImportFile(
  id: Exclude<ImportFormatId, "encrypted_export">,
  content: string | Uint8Array,
): ParsedImport {
  const text = () => (typeof content === "string" ? content : new TextDecoder().decode(content));
  switch (id) {
    case "bitwarden_json":
      return parseBitwardenJson(text());
    case "bitwarden_csv":
      return parseBitwardenCsv(text());
    case "onepassword_1pux":
      return parseOnePassword1pux(
        typeof content === "string" ? new TextEncoder().encode(content) : content,
      );
    case "onepassword_csv":
      return parseOnePasswordCsv(text());
    case "lastpass_csv":
      return parseLastPassCsv(text());
    case "generic_csv":
      return parseGenericCsv(text());
  }
}

/** One batch request before encryption. */
export interface ImportChunk {
  folders: { id: string; name: string }[];
  items: { id: string; type: ItemType; folderId: string | null; data: ItemData }[];
}

const folderKey = (name: string) => name.trim().toLocaleLowerCase();

/**
 * Splits the import into batches. Folder names that already exist (case
 * insensitive) reuse that folder; each new folder is created in the batch
 * of its first item, so an item never points at a folder from a later batch.
 */
export function planImport(
  items: ImportedItem[],
  existing: FolderEntry[],
  newId: () => string = () => crypto.randomUUID(),
): ImportChunk[] {
  const folderIds = new Map<string, string>();
  for (const folder of existing) {
    if (folder.name !== null && !folderIds.has(folderKey(folder.name))) {
      folderIds.set(folderKey(folder.name), folder.id);
    }
  }

  const chunks: ImportChunk[] = [];
  for (let start = 0; start < items.length; start += VAULT_LIMITS.batchItems) {
    const chunk: ImportChunk = { folders: [], items: [] };
    for (const item of items.slice(start, start + VAULT_LIMITS.batchItems)) {
      let folderId: string | null = null;
      if (item.folder) {
        const key = folderKey(item.folder);
        folderId = folderIds.get(key) ?? null;
        if (!folderId) {
          folderId = newId();
          folderIds.set(key, folderId);
          chunk.folders.push({ id: folderId, name: item.folder.trim() });
        }
      }
      chunk.items.push({ id: newId(), type: item.type, folderId, data: item.data });
    }
    chunks.push(chunk);
  }
  return chunks;
}

export function summarize(parsed: ParsedImport) {
  const byType = { login: 0, note: 0, totp: 0 } as Record<ItemType, number>;
  for (const item of parsed.items) byType[item.type]++;
  const folders = new Set(parsed.items.flatMap((i) => (i.folder ? [folderKey(i.folder)] : [])));
  return { total: parsed.items.length, byType, folders: folders.size };
}
