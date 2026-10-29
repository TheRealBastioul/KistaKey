// JSON-based importers: Bitwarden JSON (unencrypted export) and 1Password
// 1PUX (a zip with export.data inside). Both are read defensively: unknown
// shapes are skipped with a message instead of throwing.
import { unzipSync } from "fflate";
import { ImportFormatError } from "./csvFormats";
import { addItem, emptyImport, type ParsedImport, type RawItem } from "./model";

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

function isoDate(v: unknown): string | null {
  const date =
    typeof v === "number"
      ? new Date(v < 1e12 ? v * 1000 : v)
      : new Date(typeof v === "string" ? v : NaN);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function history(entries: { password: string; changedAt: string | null }[]) {
  return entries
    .filter((h): h is { password: string; changedAt: string } => !!h.password && !!h.changedAt)
    .sort((a, b) => b.changedAt.localeCompare(a.changedAt));
}

function parseJson(text: string, what: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new ImportFormatError(`This isn't a ${what} file (not valid JSON).`);
  }
}

// Bitwarden item types.
const BW_LOGIN = 1;
const BW_NOTE = 2;
const BW_CARD = 3;
const BW_IDENTITY = 4;
// Bitwarden custom field types: 0 text, 1 hidden, 2 boolean, 3 linked.
const BW_FIELD_HIDDEN = 1;
const BW_FIELD_LINKED = 3;

const CARD_FIELDS: [string, string, boolean][] = [
  ["cardholderName", "Cardholder name", false],
  ["brand", "Brand", false],
  ["number", "Number", true],
  ["expMonth", "Expiry month", false],
  ["expYear", "Expiry year", false],
  ["code", "Security code", true],
];

/** Bitwarden JSON export (unencrypted). Cards and identities become secure notes with fields. */
export function parseBitwardenJson(text: string): ParsedImport {
  const root = parseJson(text, "Bitwarden JSON");
  if (!isObj(root) || !Array.isArray(root.items)) {
    throw new ImportFormatError("This doesn't look like a Bitwarden JSON export.");
  }
  if (root.encrypted === true) {
    throw new ImportFormatError(
      "This Bitwarden export is encrypted. Export again choosing the unencrypted .json format.",
    );
  }
  const folders = new Map(
    arr(root.folders)
      .filter(isObj)
      .map((f) => [str(f.id), str(f.name)]),
  );

  const out = emptyImport();
  arr(root.items).forEach((value, index) => {
    const where = `Item ${index + 1}`;
    if (!isObj(value)) {
      out.skipped.push({ where, message: "Not an item." });
      return;
    }
    const type = value.type;
    const login = isObj(value.login) ? value.login : {};
    const fields: NonNullable<RawItem["fields"]> = arr(value.fields)
      .filter(isObj)
      .filter((f) => f.type !== BW_FIELD_LINKED)
      .map((f) => ({
        label: str(f.name),
        value: typeof f.value === "string" ? f.value : String(f.value ?? ""),
        hidden: f.type === BW_FIELD_HIDDEN,
      }));

    if (type === BW_CARD && isObj(value.card)) {
      const card = value.card;
      for (const [key, label, hidden] of CARD_FIELDS) {
        if (str(card[key])) fields.push({ label, value: str(card[key]), hidden });
      }
    } else if (type === BW_IDENTITY && isObj(value.identity)) {
      for (const [key, v] of Object.entries(value.identity)) {
        if (str(v))
          fields.push({ label: key, value: str(v), hidden: /ssn|passport|license/i.test(key) });
      }
    } else if (type !== BW_LOGIN && type !== BW_NOTE) {
      out.skipped.push({ where: str(value.name) || where, message: "Unsupported item type." });
      return;
    }

    addItem(out, {
      where: str(value.name) ? `Item “${str(value.name)}”` : where,
      kind: type === BW_LOGIN ? "login" : "note",
      name: str(value.name),
      folder: folders.get(str(value.folderId)) ?? "",
      favorite: value.favorite === true,
      notes: str(value.notes),
      fields,
      username: str(login.username),
      password: str(login.password),
      totp: str(login.totp),
      uris: arr(login.uris)
        .filter(isObj)
        .map((u) => str(u.uri)),
      passwordHistory: history(
        arr(value.passwordHistory)
          .filter(isObj)
          .map((h) => ({ password: str(h.password), changedAt: isoDate(h.lastUsedDate) })),
      ),
    });
  });
  return out;
}

// 1Password category ids.
const OP_LOGIN = "001";
const OP_NOTE = "003";
const OP_PASSWORD = "005";

/** One 1PUX section field value → text (+ whether it's secret, or an otpauth). */
function opFieldValue(value: unknown): { text: string; hidden: boolean; totp: boolean } | null {
  if (!isObj(value)) return null;
  const [kind, v] = Object.entries(value)[0] ?? [];
  if (kind === undefined) return null;
  if (kind === "totp") return { text: str(v), hidden: true, totp: true };
  if (kind === "concealed") return { text: str(v), hidden: true, totp: false };
  if (kind === "email" && isObj(v))
    return { text: str(v.email_address), hidden: false, totp: false };
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
    return { text: String(v), hidden: false, totp: false };
  }
  return null;
}

/** 1Password 1PUX export (zip). Each vault's name becomes the folder when there's more than one. */
export function parseOnePassword1pux(bytes: Uint8Array): ParsedImport {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, { filter: (f) => f.name === "export.data" });
  } catch {
    throw new ImportFormatError("This isn't a 1PUX file (not a zip archive).");
  }
  const data = files["export.data"];
  if (!data) throw new ImportFormatError("This 1PUX file has no export.data inside.");
  const root = parseJson(new TextDecoder().decode(data), "1PUX");
  if (!isObj(root) || !Array.isArray(root.accounts)) {
    throw new ImportFormatError("This doesn't look like a 1Password export.");
  }

  const vaults = arr(root.accounts)
    .filter(isObj)
    .flatMap((account) => arr(account.vaults).filter(isObj));
  const useVaultFolders = vaults.length > 1;

  const out = emptyImport();
  for (const vault of vaults) {
    const vaultName = isObj(vault.attrs) ? str(vault.attrs.name) : "";
    arr(vault.items)
      .filter(isObj)
      .forEach((item, index) => {
        const overview = isObj(item.overview) ? item.overview : {};
        const details = isObj(item.details) ? item.details : {};
        const title = str(overview.title);
        const where = title ? `Item “${title}”` : `${vaultName || "Vault"} item ${index + 1}`;
        if (item.state === "archived") {
          out.skipped.push({ where, message: "Archived in 1Password." });
          return;
        }
        const category = str(item.categoryUuid);
        if (category !== OP_LOGIN && category !== OP_NOTE && category !== OP_PASSWORD) {
          // Cards, identities, documents…: keep their fields in a note.
          if (!arr(details.sections).length && !str(details.notesPlain)) {
            out.skipped.push({ where, message: "Unsupported item type." });
            return;
          }
        }

        let username = "";
        let password = str(details.password);
        for (const field of arr(details.loginFields).filter(isObj)) {
          if (field.designation === "username" && !username) username = str(field.value);
          if (field.designation === "password" && !password) password = str(field.value);
        }

        let totp = "";
        const fields: NonNullable<RawItem["fields"]> = [];
        for (const section of arr(details.sections).filter(isObj)) {
          for (const field of arr(section.fields).filter(isObj)) {
            const value = opFieldValue(field.value);
            if (!value?.text) continue;
            if (value.totp && !totp) {
              totp = value.text;
              continue;
            }
            fields.push({ label: str(field.title), value: value.text, hidden: value.hidden });
          }
        }

        const urls = [
          str(overview.url),
          ...arr(overview.urls)
            .filter(isObj)
            .map((u) => str(u.url)),
        ];
        addItem(out, {
          where,
          kind: category === OP_LOGIN || category === OP_PASSWORD ? "login" : "note",
          name: title,
          folder: useVaultFolders ? vaultName : "",
          favorite: typeof item.favIndex === "number" && item.favIndex > 0,
          username,
          password,
          totp,
          uris: [...new Set(urls.filter(Boolean))],
          notes: str(details.notesPlain),
          fields,
          passwordHistory: history(
            arr(details.passwordHistory)
              .filter(isObj)
              .map((h) => ({ password: str(h.value), changedAt: isoDate(h.time) })),
          ),
        });
      });
  }
  return out;
}
