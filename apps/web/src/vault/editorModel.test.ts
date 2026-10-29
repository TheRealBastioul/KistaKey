import { type ItemData, ItemDataSchema, VAULT_LIMITS } from "@repo/types";
import { describe, expect, it } from "vitest";
import {
  buildItemData,
  changedFields,
  draftFromItem,
  emptyDraft,
  encryptedLength,
  type ItemDraft,
  newCustomField,
  nextPasswordHistory,
} from "./editorModel";

const NOW = new Date("2026-10-28T12:00:00.000Z");

function ok(result: ReturnType<typeof buildItemData>): ItemData {
  if (!result.ok) throw new Error(`expected ok, got ${JSON.stringify(result.errors)}`);
  return result.data;
}

function errors(result: ReturnType<typeof buildItemData>) {
  if (result.ok) throw new Error("expected errors");
  return result.errors;
}

function login(patch: Partial<ItemDraft> = {}): ItemDraft {
  return { ...emptyDraft("login"), name: "GitHub", username: "octo", password: "pw1", ...patch };
}

describe("buildItemData", () => {
  it("builds a login, dropping blank URI rows and trimming the name", () => {
    const draft = login({ name: "  GitHub ", uris: [{ key: "a", uri: " github.com " }] });
    draft.uris.push({ key: "b", uri: "  " });
    expect(ok(buildItemData(draft, null, NOW))).toEqual({
      name: "GitHub",
      favorite: false,
      login: { username: "octo", password: "pw1", uris: [{ uri: "github.com" }] },
      customFields: [],
      passwordHistory: [],
    });
  });

  it("requires a name", () => {
    expect(errors(buildItemData(login({ name: "  " }), null, NOW)).name).toMatch(/name/);
  });

  it("enforces the vault limits before encrypting", () => {
    const tooLong = (n: number) => "x".repeat(n + 1);
    const draft = login({
      name: tooLong(VAULT_LIMITS.nameChars),
      password: tooLong(VAULT_LIMITS.passwordChars),
      note: tooLong(VAULT_LIMITS.noteChars),
      uris: [{ key: "u", uri: tooLong(VAULT_LIMITS.uriChars) }],
    });
    const field = newCustomField(true);
    field.label = tooLong(VAULT_LIMITS.customFieldLabelChars);
    draft.customFields = [field];
    const result = errors(buildItemData(draft, null, NOW));
    expect(Object.keys(result).sort()).toEqual(
      [`custom:${field.id}`, "name", "note", "password", "uri:u"].sort(),
    );
  });

  it("limits the number of custom fields and URIs", () => {
    const fields = Array.from({ length: VAULT_LIMITS.customFields + 1 }, () => ({
      ...newCustomField(false),
      label: "L",
      value: "v",
    }));
    expect(errors(buildItemData(login({ customFields: fields }), null, NOW)).form).toMatch(
      /custom fields/,
    );
    const uris = Array.from({ length: VAULT_LIMITS.uris + 1 }, (_, i) => ({
      key: String(i),
      uri: `site${i}.example`,
    }));
    expect(errors(buildItemData(login({ uris }), null, NOW)).form).toMatch(/websites/);
  });

  it("refuses an item whose encrypted blob would be over the limit", () => {
    const fields = Array.from({ length: 15 }, () => ({
      ...newCustomField(false),
      label: "Big",
      value: "y".repeat(VAULT_LIMITS.customFieldValueChars),
    }));
    expect(errors(buildItemData(login({ customFields: fields }), null, NOW)).form).toMatch(
      /too big/,
    );
  });

  it("needs a label on a custom field that has a value; drops empty ones", () => {
    const named = { ...newCustomField(true), label: " PIN ", value: "1234" };
    const blank = newCustomField(false);
    const unlabeled = { ...newCustomField(false), value: "v" };
    expect(
      errors(buildItemData(login({ customFields: [named, unlabeled] }), null, NOW))[
        `custom:${unlabeled.id}`
      ],
    ).toMatch(/label/);
    const data = ok(buildItemData(login({ customFields: [named, blank] }), null, NOW));
    expect(data.customFields).toEqual([
      { id: named.id, label: "PIN", value: "1234", hidden: true },
    ]);
  });

  it("builds a note (body required even if empty) without login details", () => {
    const data = ok(buildItemData({ ...emptyDraft("note"), name: "Wi-Fi" }, null, NOW));
    expect(data.note).toBe("");
    expect(data.login).toBeUndefined();
  });

  it("leaves an empty note out of other types", () => {
    expect(ok(buildItemData(login(), null, NOW)).note).toBeUndefined();
  });

  it("builds a totp item from an otpauth URI and requires a key", () => {
    const draft = {
      ...emptyDraft("totp"),
      name: "AWS",
      username: "root",
      totpKey: "otpauth://totp/AWS:root?secret=GEZDGNBVGY3TQOJQ&digits=8",
    };
    expect(ok(buildItemData(draft, null, NOW)).login?.totp).toEqual({
      secret: "GEZDGNBVGY3TQOJQ",
      algorithm: "SHA1",
      digits: 8,
      period: 30,
    });
    expect(errors(buildItemData({ ...draft, totpKey: "" }, null, NOW)).totp).toBeDefined();
  });

  it("removes TOTP from a login when the key is cleared", () => {
    const base = ItemDataSchema.parse({
      name: "GitHub",
      login: {
        username: "octo",
        password: "pw1",
        totp: { secret: "JBSWY3DPEHPK3PXP", algorithm: "SHA1", digits: 6, period: 30 },
      },
    });
    const draft = { ...draftFromItem("login", null, base), totpKey: "" };
    expect(ok(buildItemData(draft, base, NOW)).login?.totp).toBeUndefined();
  });
});

describe("editing", () => {
  const base = ItemDataSchema.parse({
    name: "GitHub",
    favorite: true,
    futureField: { kept: true },
    login: {
      username: "octo",
      password: "old",
      uris: [{ uri: "github.com", match: "host" }],
      passkey: "newer-client",
    },
    customFields: [
      { id: "11111111-1111-4111-8111-111111111111", label: "PIN", value: "1", hidden: true, x: 1 },
    ],
    passwordHistory: [{ password: "older", changedAt: "2026-01-01T00:00:00.000Z" }],
  });

  it("round-trips unchanged and keeps fields a newer client added", () => {
    const data = ok(buildItemData(draftFromItem("login", null, base), base, NOW));
    expect(data).toEqual(base);
  });

  it("moves a changed password into the history, newest first", () => {
    const draft = { ...draftFromItem("login", null, base), password: "new" };
    const data = ok(buildItemData(draft, base, NOW));
    expect(data.login?.password).toBe("new");
    expect(data.passwordHistory).toEqual([
      { password: "old", changedAt: NOW.toISOString() },
      { password: "older", changedAt: "2026-01-01T00:00:00.000Z" },
    ]);
  });

  it("keeps at most the history limit and ignores an empty previous password", () => {
    const history = Array.from({ length: VAULT_LIMITS.passwordHistory }, (_, i) => ({
      password: `p${i}`,
      changedAt: NOW.toISOString(),
    }));
    const next = nextPasswordHistory(history, "current", "new", NOW);
    expect(next).toHaveLength(VAULT_LIMITS.passwordHistory);
    expect(next[0]?.password).toBe("current");
    expect(nextPasswordHistory(history, "", "new", NOW)).toBe(history);
    expect(nextPasswordHistory(history, "same", "same", NOW)).toBe(history);
  });

  it("lists the fields that differ between two versions", () => {
    const other = ItemDataSchema.parse({
      ...base,
      favorite: false,
      login: { ...base.login, password: "changed" },
    });
    expect(changedFields(base, other)).toEqual(["Favorite", "Password"]);
    expect(changedFields(base, base)).toEqual([]);
  });
});

describe("encryptedLength", () => {
  it("matches the blob format's size for ASCII and multi-byte text", () => {
    // 10 bytes + 16-byte tag = 26 bytes → 35 base64url chars, + 48 header/nonce allowance.
    expect(encryptedLength("0123456789")).toBe(83);
    expect(encryptedLength("é")).toBe(48 + Math.ceil((18 * 4) / 3));
  });
});
