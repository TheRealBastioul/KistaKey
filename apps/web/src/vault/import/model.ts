// What every import parser produces (decisions §21): plain items with a
// folder *name*, checked against the same limits the editor enforces. Rows
// that can't become a valid item are skipped and reported, never sent.
import {
  type CustomField,
  type ItemData,
  type ItemType,
  itemDataSchemaFor,
  type TotpConfig,
  VAULT_LIMITS,
} from "@repo/types";
import { encryptedLength } from "../editorModel";
import { parseTotpInput } from "../totpInput";

export interface ImportedItem {
  type: ItemType;
  /** Folder name (created on import), or null. */
  folder: string | null;
  data: ItemData;
}

export interface ImportProblem {
  /** Where: "Row 4", "Item “GitHub”". */
  where: string;
  message: string;
}

export interface ParsedImport {
  items: ImportedItem[];
  /** Skipped entries. */
  skipped: ImportProblem[];
  /** Imported, but something was dropped or changed. */
  warnings: ImportProblem[];
}

/** One entry as a parser reads it, before validation. */
export interface RawItem {
  where: string;
  /** "note" forces a secure note; otherwise login vs note is inferred. */
  kind?: "login" | "note";
  name?: string;
  folder?: string;
  favorite?: boolean;
  username?: string;
  password?: string;
  uris?: string[];
  notes?: string;
  /** otpauth:// URI or a bare base32 key. */
  totp?: string;
  fields?: { label: string; value: string; hidden: boolean }[];
  passwordHistory?: { password: string; changedAt: string }[];
}

function hostOf(uri: string): string {
  try {
    return new URL(uri).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

const clean = (s: string | undefined) => (s ?? "").trim();

/** Builds and validates one item. Pushes to `out.skipped` / `out.warnings` as needed. */
export function addItem(out: ParsedImport, raw: RawItem): void {
  const warn = (message: string) => out.warnings.push({ where: raw.where, message });
  const uris = (raw.uris ?? []).map(clean).filter(Boolean);
  const username = raw.username ?? "";
  const password = raw.password ?? "";
  const notes = raw.notes ?? "";

  const fields: CustomField[] = (raw.fields ?? [])
    .filter((f) => f.value !== "" || f.label.trim() !== "")
    .map((f) => ({
      id: crypto.randomUUID(),
      label: clean(f.label).slice(0, VAULT_LIMITS.customFieldLabelChars) || "Field",
      value: f.value,
      hidden: f.hidden,
    }));

  let totp: TotpConfig | undefined;
  if (clean(raw.totp)) {
    try {
      totp = parseTotpInput(clean(raw.totp)).totp;
    } catch {
      // Keep the value rather than lose it.
      fields.push({ id: crypto.randomUUID(), label: "TOTP", value: clean(raw.totp), hidden: true });
      warn("The authenticator key wasn't valid; it was kept as a hidden field.");
    }
  }

  const isNote =
    raw.kind === "note" || (!username && !password && uris.length === 0 && !totp && !!notes);
  const type: ItemType = isNote ? "note" : "login";
  const name =
    clean(raw.name) || hostOf(uris[0] ?? "") || clean(username) || (isNote ? "Note" : "Login");

  if (uris.length > VAULT_LIMITS.uris)
    warn(`Only the first ${VAULT_LIMITS.uris} websites were kept.`);
  if (fields.length > VAULT_LIMITS.customFields) {
    warn(`Only the first ${VAULT_LIMITS.customFields} custom fields were kept.`);
  }

  const data = {
    name: name.slice(0, VAULT_LIMITS.nameChars),
    favorite: raw.favorite ?? false,
    ...(isNote
      ? {}
      : {
          login: {
            username,
            password,
            uris: uris.slice(0, VAULT_LIMITS.uris).map((uri) => ({ uri })),
            ...(totp ? { totp } : {}),
          },
        }),
    ...(isNote || notes ? { note: notes } : {}),
    customFields: fields.slice(0, VAULT_LIMITS.customFields),
    passwordHistory: (raw.passwordHistory ?? [])
      .filter((h) => h.password)
      .slice(0, VAULT_LIMITS.passwordHistory),
  };
  if (clean(raw.name) && clean(raw.name).length > VAULT_LIMITS.nameChars) {
    warn("The name was shortened.");
  }

  const parsed = itemDataSchemaFor(type).safeParse(data);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue?.path.join(".") ?? "";
    out.skipped.push({
      where: raw.where,
      message: `${path ? `${path}: ` : ""}${issue?.message ?? "invalid item"}`,
    });
    return;
  }
  if (encryptedLength(JSON.stringify(parsed.data)) > VAULT_LIMITS.encryptedItemChars) {
    out.skipped.push({ where: raw.where, message: "Too large to store as one item." });
    return;
  }
  const folder = clean(raw.folder).slice(0, VAULT_LIMITS.folderNameChars);
  out.items.push({ type, folder: folder || null, data: parsed.data });
}

export function emptyImport(): ParsedImport {
  return { items: [], skipped: [], warnings: [] };
}
