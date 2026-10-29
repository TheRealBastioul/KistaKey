import { describe, expect, it } from "vitest";
import {
  ItemCreateRequestSchema,
  ItemDataSchema,
  ItemUpdateRequestSchema,
  itemDataSchemaFor,
  VAULT_LIMITS,
  VaultBatchImportRequestSchema,
  VaultSyncQuerySchema,
} from "./vault";

const ID = "6f1d2c3b-4a59-4e8d-9c7b-0a1b2c3d4e5f";
const ID_2 = "7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c0d";
const BLOB = "v1.xc20p.QUJD.REVG";

describe("ItemDataSchema", () => {
  it("fills defaults for a minimal item", () => {
    expect(ItemDataSchema.parse({ name: "Mail", login: {} })).toEqual({
      name: "Mail",
      favorite: false,
      login: { username: "", password: "", uris: [] },
      customFields: [],
      passwordHistory: [],
    });
  });

  it("keeps fields it doesn't know (a newer client's), so edits don't drop them", () => {
    const parsed = ItemDataSchema.parse({ name: "x", passkey: { id: 1 }, login: { extra: true } });
    expect(parsed).toMatchObject({ passkey: { id: 1 }, login: { extra: true } });
  });

  it("enforces the limits", () => {
    const field = { id: ID, label: "PIN", value: "1234", hidden: true };
    const tooMany = Array.from({ length: VAULT_LIMITS.customFields + 1 }, () => field);
    expect(ItemDataSchema.safeParse({ name: "x", customFields: tooMany }).success).toBe(false);
    expect(
      ItemDataSchema.safeParse({ name: "x", note: "a".repeat(VAULT_LIMITS.noteChars + 1) }).success,
    ).toBe(false);
    expect(
      ItemDataSchema.safeParse({ name: "x", note: "a".repeat(VAULT_LIMITS.noteChars) }).success,
    ).toBe(true);
    expect(ItemDataSchema.safeParse({ name: "" }).success).toBe(false);
    expect(
      ItemDataSchema.safeParse({ name: "x", customFields: [{ ...field, label: "" }] }).success,
    ).toBe(false);
  });

  it("validates TOTP settings", () => {
    const totp = { secret: "JBSWY3DPEHPK3PXP", algorithm: "SHA1", digits: 6, period: 30 };
    expect(ItemDataSchema.safeParse({ name: "x", login: { totp } }).success).toBe(true);
    for (const bad of [
      { secret: "jbswy3dp" },
      { algorithm: "MD5" },
      { digits: 9 },
      { period: 0 },
    ]) {
      expect(
        ItemDataSchema.safeParse({ name: "x", login: { totp: { ...totp, ...bad } } }).success,
      ).toBe(false);
    }
  });
});

describe("itemDataSchemaFor", () => {
  it("requires what each type needs", () => {
    expect(itemDataSchemaFor("login").safeParse({ name: "x" }).success).toBe(false);
    expect(itemDataSchemaFor("login").safeParse({ name: "x", login: {} }).success).toBe(true);
    expect(itemDataSchemaFor("note").safeParse({ name: "x" }).success).toBe(false);
    expect(itemDataSchemaFor("note").safeParse({ name: "x", note: "" }).success).toBe(true);
    expect(itemDataSchemaFor("totp").safeParse({ name: "x", login: {} }).success).toBe(false);
    expect(
      itemDataSchemaFor("totp").safeParse({
        name: "x",
        login: {
          username: "me",
          totp: { secret: "JBSWY3DPEHPK3PXP", algorithm: "SHA1", digits: 6, period: 30 },
        },
      }).success,
    ).toBe(true);
  });
});

describe("item requests", () => {
  it("accepts a create with a client-picked id; folder defaults to none", () => {
    const parsed = ItemCreateRequestSchema.parse({
      id: ID,
      type: "login",
      encryptedKey: BLOB,
      encryptedData: BLOB,
    });
    expect(parsed.folderId).toBeNull();
  });

  it("rejects plaintext where a blob belongs", () => {
    expect(
      ItemCreateRequestSchema.safeParse({
        id: ID,
        type: "login",
        encryptedKey: BLOB,
        encryptedData: '{"password":"hunter2"}',
      }).success,
    ).toBe(false);
  });

  it("caps the item blob at 64 KB", () => {
    const big = `v1.xc20p.QUJD.${"A".repeat(VAULT_LIMITS.encryptedItemChars)}`;
    expect(
      ItemCreateRequestSchema.safeParse({
        id: ID,
        type: "note",
        encryptedKey: BLOB,
        encryptedData: big,
      }).success,
    ).toBe(false);
  });

  it("requires expectedRevision on update", () => {
    const update = { folderId: null, encryptedKey: BLOB, encryptedData: BLOB };
    expect(ItemUpdateRequestSchema.safeParse(update).success).toBe(false);
    expect(ItemUpdateRequestSchema.safeParse({ ...update, expectedRevision: 3 }).success).toBe(
      true,
    );
  });

  it("rejects an unknown type", () => {
    expect(
      ItemCreateRequestSchema.safeParse({
        id: ID,
        type: "passkey",
        encryptedKey: BLOB,
        encryptedData: BLOB,
      }).success,
    ).toBe(false);
  });
});

describe("VaultSyncQuerySchema", () => {
  it("coerces the query string and allows no `since`", () => {
    expect(VaultSyncQuerySchema.parse({ since: "42" })).toEqual({ since: 42 });
    expect(VaultSyncQuerySchema.parse({})).toEqual({});
    expect(VaultSyncQuerySchema.safeParse({ since: "-1" }).success).toBe(false);
  });
});

describe("VaultBatchImportRequestSchema", () => {
  const item = { id: ID, type: "login", encryptedKey: BLOB, encryptedData: BLOB };

  it("accepts up to 500 items", () => {
    const items = Array.from({ length: 500 }, (_, i) => ({
      ...item,
      id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    }));
    expect(VaultBatchImportRequestSchema.safeParse({ format: "csv", items }).success).toBe(true);
    const tooMany = [...items, { ...item, id: ID_2 }];
    expect(VaultBatchImportRequestSchema.safeParse({ format: "csv", items: tooMany }).success).toBe(
      false,
    );
  });

  it("rejects an empty batch and duplicate ids", () => {
    expect(VaultBatchImportRequestSchema.safeParse({ format: "csv", items: [] }).success).toBe(
      false,
    );
    expect(
      VaultBatchImportRequestSchema.safeParse({ format: "csv", items: [item, item] }).success,
    ).toBe(false);
  });
});
