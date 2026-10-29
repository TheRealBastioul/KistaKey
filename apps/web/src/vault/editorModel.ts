// The item editor's form model, kept free of React so it's unit-tested:
// a flat draft the inputs bind to, built from a stored item or empty for a
// new one, and `buildItemData` that validates it against VAULT_LIMITS and
// turns it back into ItemData before anything is encrypted.
//
// Building starts from the stored data (a loose object), so fields a newer
// client added survive the edit (decisions §15.10). A changed password moves
// the old one into the encrypted password history.
import {
  type CustomField,
  type ItemData,
  type ItemType,
  type ItemUri,
  itemDataSchemaFor,
  type PasswordHistoryEntry,
  type TotpConfig,
  VAULT_LIMITS,
} from "@repo/types";
import { DEFAULT_TOTP_SETTINGS, parseTotpInput, type TotpSettings } from "./totpInput";

export interface UriDraft {
  /** React key; not stored. */
  key: string;
  uri: string;
  /** The stored object, so unknown fields on it survive. */
  original?: ItemUri;
}

export interface CustomFieldDraft {
  id: string;
  label: string;
  value: string;
  hidden: boolean;
  original?: CustomField;
}

export interface ItemDraft {
  type: ItemType;
  folderId: string | null;
  name: string;
  favorite: boolean;
  username: string;
  password: string;
  uris: UriDraft[];
  /** The setup key as typed (base32 secret or an otpauth:// URI); "" = no TOTP. */
  totpKey: string;
  totpSettings: TotpSettings;
  note: string;
  customFields: CustomFieldDraft[];
}

/** Field → message. Keys: `name`, `username`, `password`, `uri:<key>`, `totp`, `note`, `custom:<id>`, `form`. */
export type DraftErrors = Record<string, string>;

export type BuildResult = { ok: true; data: ItemData } | { ok: false; errors: DraftErrors };

const newKey = () => crypto.randomUUID();

export function emptyDraft(type: ItemType, folderId: string | null = null): ItemDraft {
  return {
    type,
    folderId,
    name: "",
    favorite: false,
    username: "",
    password: "",
    uris: type === "login" ? [{ key: newKey(), uri: "" }] : [],
    totpKey: "",
    totpSettings: { ...DEFAULT_TOTP_SETTINGS },
    note: "",
    customFields: [],
  };
}

export function draftFromItem(type: ItemType, folderId: string | null, data: ItemData): ItemDraft {
  const login = data.login;
  const totp = login?.totp;
  return {
    type,
    folderId,
    name: data.name,
    favorite: data.favorite,
    username: login?.username ?? "",
    password: login?.password ?? "",
    uris: (login?.uris ?? []).map((original) => ({ key: newKey(), uri: original.uri, original })),
    totpKey: totp?.secret ?? "",
    totpSettings: totp
      ? { algorithm: totp.algorithm, digits: totp.digits, period: totp.period }
      : { ...DEFAULT_TOTP_SETTINGS },
    note: data.note ?? "",
    customFields: data.customFields.map((original) => ({
      id: original.id,
      label: original.label,
      value: original.value,
      hidden: original.hidden,
      original,
    })),
  };
}

export function newCustomField(hidden: boolean): CustomFieldDraft {
  return { id: newKey(), label: "", value: "", hidden };
}

export function newUri(): UriDraft {
  return { key: newKey(), uri: "" };
}

/**
 * Length of the `encryptedData` blob for this JSON: `v1.xc20p.<nonce>.<ct>`
 * with a 24-byte nonce and a 16-byte tag, base64url without padding. A few
 * characters spare for a longer version header.
 */
export function encryptedLength(json: string): number {
  const bytes = new TextEncoder().encode(json).length;
  return 48 + Math.ceil(((bytes + 16) * 4) / 3);
}

function tooLong(what: string, max: number): string {
  return `${what} can be at most ${max.toLocaleString()} characters.`;
}

/** The previous password goes to the front of the history; the oldest beyond the limit drops off. */
export function nextPasswordHistory(
  history: PasswordHistoryEntry[],
  previous: string,
  next: string,
  now: Date,
): PasswordHistoryEntry[] {
  if (!previous || previous === next) return history;
  return [{ password: previous, changedAt: now.toISOString() }, ...history].slice(
    0,
    VAULT_LIMITS.passwordHistory,
  );
}

/**
 * Validates the draft and merges it into `base` (the stored data the edit
 * replaces; null for a new item). Blank URI rows and blank custom fields are
 * dropped.
 */
export function buildItemData(draft: ItemDraft, base: ItemData | null, now: Date): BuildResult {
  const errors: DraftErrors = {};
  const L = VAULT_LIMITS;
  const name = draft.name.trim();
  if (!name) errors.name = "Give the item a name.";
  else if (name.length > L.nameChars) errors.name = tooLong("The name", L.nameChars);

  const hasLogin = draft.type === "login" || draft.type === "totp";
  if (hasLogin && draft.username.length > L.usernameChars) {
    errors.username = tooLong("The username", L.usernameChars);
  }
  if (draft.type === "login" && draft.password.length > L.passwordChars) {
    errors.password = tooLong("The password", L.passwordChars);
  }

  const uris = draft.type === "login" ? draft.uris.filter((u) => u.uri.trim() !== "") : [];
  if (uris.length > L.uris) errors.form = `An item can have at most ${L.uris} websites.`;
  for (const u of uris) {
    if (u.uri.trim().length > L.uriChars) errors[`uri:${u.key}`] = tooLong("A website", L.uriChars);
  }

  let totp: TotpConfig | undefined;
  if (hasLogin && (draft.totpKey.trim() !== "" || draft.type === "totp")) {
    try {
      totp = { ...base?.login?.totp, ...parseTotpInput(draft.totpKey, draft.totpSettings).totp };
    } catch (err) {
      errors.totp = err instanceof Error ? err.message : "That setup key isn't valid.";
    }
  }

  if (draft.note.length > L.noteChars) errors.note = tooLong("Notes", L.noteChars);

  const fields = draft.customFields.filter((f) => f.label.trim() !== "" || f.value !== "");
  if (fields.length > L.customFields) {
    errors.form = `An item can have at most ${L.customFields} custom fields.`;
  }
  for (const f of fields) {
    const label = f.label.trim();
    if (!label) errors[`custom:${f.id}`] = "Give the field a label.";
    else if (label.length > L.customFieldLabelChars) {
      errors[`custom:${f.id}`] = tooLong("A field label", L.customFieldLabelChars);
    } else if (f.value.length > L.customFieldValueChars) {
      errors[`custom:${f.id}`] = tooLong("A field value", L.customFieldValueChars);
    }
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const baseLogin = base?.login;
  const password = draft.type === "login" ? draft.password : (baseLogin?.password ?? "");
  const data: Record<string, unknown> = {
    ...base,
    name,
    favorite: draft.favorite,
    customFields: fields.map((f) => ({
      ...f.original,
      id: f.id,
      label: f.label.trim(),
      value: f.value,
      hidden: f.hidden,
    })),
    passwordHistory: nextPasswordHistory(
      base?.passwordHistory ?? [],
      baseLogin?.password ?? "",
      password,
      now,
    ),
  };

  if (hasLogin) {
    const login: Record<string, unknown> = {
      ...baseLogin,
      username: draft.username,
      password,
      uris:
        draft.type === "login"
          ? uris.map((u) => ({ ...u.original, uri: u.uri.trim() }))
          : (baseLogin?.uris ?? []),
    };
    if (totp) login.totp = totp;
    else delete login.totp;
    data.login = login;
  }

  // A note item's body is required (may be empty); elsewhere an empty note is left out.
  if (draft.type === "note" || draft.note !== "") data.note = draft.note;
  else delete data.note;

  const parsed = itemDataSchemaFor(draft.type).safeParse(data);
  if (!parsed.success) {
    return { ok: false, errors: { form: "Some fields aren't valid. Check and try again." } };
  }
  if (encryptedLength(JSON.stringify(parsed.data)) > L.encryptedItemChars) {
    return {
      ok: false,
      errors: { form: "This item is too big to save. Shorten the notes or custom fields." },
    };
  }
  return { ok: true, data: parsed.data };
}

const FIELD_LABELS: [string, (d: ItemData) => unknown][] = [
  ["Name", (d) => d.name],
  ["Favorite", (d) => d.favorite],
  ["Username", (d) => d.login?.username],
  ["Password", (d) => d.login?.password],
  ["Websites", (d) => d.login?.uris.map((u) => u.uri)],
  ["Authenticator key", (d) => d.login?.totp],
  ["Notes", (d) => d.note],
  [
    "Custom fields",
    (d) => d.customFields.map(({ label, value, hidden }) => [label, value, hidden]),
  ],
];

/** Names of the fields that differ between two versions (for the conflict dialog). */
export function changedFields(a: ItemData, b: ItemData): string[] {
  return FIELD_LABELS.filter(
    ([, get]) => JSON.stringify(get(a) ?? null) !== JSON.stringify(get(b) ?? null),
  ).map(([label]) => label);
}
