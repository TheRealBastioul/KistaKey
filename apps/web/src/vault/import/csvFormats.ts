// CSV importers: generic, Bitwarden, 1Password, LastPass. Each maps its
// columns onto RawItem; model.ts validates. Headers are matched lowercased.
import { csvRecords } from "./csv";
import { addItem, emptyImport, type ParsedImport, type RawItem } from "./model";

export class ImportFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportFormatError";
  }
}

type Rec = Record<string, string>;

/** First non-empty value among these columns. */
function pick(record: Rec, names: string[]): string {
  for (const name of names) {
    const value = record[name];
    if (value !== undefined && value !== "") return value;
  }
  return "";
}

function requireColumns(headers: string[], anyOf: string[][], what: string): void {
  const missing = anyOf.find((alts) => !alts.some((name) => headers.includes(name)));
  if (missing) {
    throw new ImportFormatError(
      `This doesn't look like a ${what} file: no "${missing[0]}" column.`,
    );
  }
}

const truthy = (value: string) => /^(1|true|yes|y|x)$/i.test(value.trim());

function run(text: string, toRaw: (record: Rec, where: string) => RawItem | null): ParsedImport {
  const out = emptyImport();
  const { records } = csvRecords(text);
  records.forEach((record, index) => {
    // Row 1 is the header.
    const raw = toRaw(record, `Row ${index + 2}`);
    if (raw) addItem(out, raw);
  });
  return out;
}

const GENERIC = {
  name: ["name", "title", "account", "item", "item name"],
  url: ["url", "uri", "website", "login_uri", "login url", "web site", "urls"],
  username: ["username", "login", "login_username", "user", "user name", "email", "login name"],
  password: ["password", "login_password", "pass"],
  notes: ["notes", "note", "extra", "comments", "comment"],
  folder: ["folder", "group", "grouping", "category", "vault"],
  totp: ["totp", "otp", "otpauth", "login_totp", "one-time password", "2fa"],
  favorite: ["favorite", "fav", "favourite"],
};

/** Any CSV with a header row; common column names are recognized (see GENERIC). */
export function parseGenericCsv(text: string): ParsedImport {
  const { headers } = csvRecords(text);
  requireColumns(headers, [[...GENERIC.name, ...GENERIC.url, ...GENERIC.password]], "CSV");
  return run(text, (r, where) => ({
    where,
    name: pick(r, GENERIC.name),
    uris: pick(r, GENERIC.url) ? [pick(r, GENERIC.url)] : [],
    username: pick(r, GENERIC.username),
    password: pick(r, GENERIC.password),
    notes: pick(r, GENERIC.notes),
    folder: pick(r, GENERIC.folder),
    totp: pick(r, GENERIC.totp),
    favorite: truthy(pick(r, GENERIC.favorite)),
  }));
}

/** Bitwarden's "fields" cell: one "label: value" per line. */
function bitwardenFields(cell: string): RawItem["fields"] {
  return cell
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => {
      const at = line.indexOf(": ");
      return at === -1
        ? { label: "Field", value: line, hidden: false }
        : { label: line.slice(0, at), value: line.slice(at + 2), hidden: false };
    });
}

/**
 * Bitwarden CSV (personal vault export). Also what this app's own CSV
 * export writes, so it re-imports. Columns: folder, favorite, type, name,
 * notes, fields, reprompt, login_uri, login_username, login_password,
 * login_totp. Multiple URIs are comma- or newline-separated.
 */
export function parseBitwardenCsv(text: string): ParsedImport {
  const { headers } = csvRecords(text);
  requireColumns(headers, [["name"], ["type"], ["login_password"]], "Bitwarden CSV");
  return run(text, (r, where) => ({
    where,
    kind: r.type === "note" ? "note" : "login",
    name: r.name ?? "",
    folder: r.folder ?? "",
    favorite: truthy(r.favorite ?? ""),
    notes: r.notes ?? "",
    fields: bitwardenFields(r.fields ?? ""),
    uris: (r.login_uri ?? "").split(/[\r\n,]+/),
    username: r.login_username ?? "",
    password: r.login_password ?? "",
    totp: r.login_totp ?? "",
  }));
}

/**
 * 1Password CSV (1Password 8: Title, Url, Username, Password, OTPAuth,
 * Favorite, Archived, Tags, Notes; older versions are close). The first tag
 * becomes the folder; archived items are skipped.
 */
export function parseOnePasswordCsv(text: string): ParsedImport {
  const { headers } = csvRecords(text);
  requireColumns(headers, [["title"], ["password"]], "1Password CSV");
  const out = run(text, (r, where) => {
    if (truthy(r.archived ?? "")) return null;
    return {
      where,
      name: r.title ?? "",
      uris: pick(r, ["url", "website", "urls"]).split(/[\r\n]+/),
      username: pick(r, ["username", "user"]),
      password: r.password ?? "",
      totp: pick(r, ["otpauth", "one-time password", "totp"]),
      favorite: truthy(r.favorite ?? ""),
      notes: pick(r, ["notes", "notesplain"]),
      folder: (r.tags ?? "").split(/[,;]/)[0] ?? "",
    };
  });
  return out;
}

const LASTPASS_NOTE_URL = "http://sn";

/**
 * LastPass CSV: url, username, password, totp, extra, name, grouping, fav.
 * Secure notes have url "http://sn"; "extra" is the note text.
 */
export function parseLastPassCsv(text: string): ParsedImport {
  const { headers } = csvRecords(text);
  requireColumns(headers, [["url"], ["password"], ["grouping"]], "LastPass CSV");
  return run(text, (r, where) => {
    const isNote = (r.url ?? "").trim() === LASTPASS_NOTE_URL;
    return {
      where,
      kind: isNote ? "note" : "login",
      name: r.name ?? "",
      uris: isNote ? [] : [r.url ?? ""],
      username: r.username ?? "",
      password: r.password ?? "",
      totp: r.totp ?? "",
      notes: r.extra ?? "",
      // LastPass nests groups with "\"; keep the full path as the folder name.
      folder: (r.grouping ?? "").replace(/\\/g, "/"),
      favorite: truthy(r.fav ?? ""),
    };
  });
}
