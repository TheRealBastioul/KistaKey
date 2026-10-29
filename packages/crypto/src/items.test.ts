import { beforeAll, describe, expect, it } from "vitest";
import { utf8Encode } from "./encoding";
import { CryptoError } from "./errors";
import {
  decryptFolderName,
  decryptItem,
  encryptFolderName,
  encryptItem,
  rewrapItemKey,
  unwrapItemKey,
} from "./items";
import { generateSymmetricKey, wrapKey } from "./keys";
import { ready } from "./sodium";
import { encrypt } from "./symmetric";

beforeAll(ready);

const ID_A = "6f1d2c3b-4a59-4e8d-9c7b-0a1b2c3d4e5f";
const ID_B = "7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c0d";
const data = {
  name: "Mail",
  favorite: false,
  login: { username: "me@example.com", password: "s3cret", uris: [] },
  customFields: [],
  passwordHistory: [],
};

describe("encryptItem / decryptItem", () => {
  it("round-trips item data", () => {
    const userKey = generateSymmetricKey();
    const item = encryptItem(userKey, ID_A, data);
    expect(item.encryptedKey).toMatch(/^v1\.xc20p\./);
    expect(item.encryptedData).toMatch(/^v1\.xc20p\./);
    expect(decryptItem(userKey, ID_A, item)).toEqual(data);
  });

  it("never puts plaintext in the blobs", () => {
    const item = encryptItem(generateSymmetricKey(), ID_A, data);
    expect(`${item.encryptedKey}${item.encryptedData}`).not.toContain("s3cret");
  });

  it("gives every new item its own key", () => {
    const userKey = generateSymmetricKey();
    const a = encryptItem(userKey, ID_A, data);
    const b = encryptItem(userKey, ID_A, data);
    expect(unwrapItemKey(userKey, ID_A, a.encryptedKey)).not.toEqual(
      unwrapItemKey(userKey, ID_A, b.encryptedKey),
    );
  });

  it("keeps the item key on edit when given the current encryptedKey", () => {
    const userKey = generateSymmetricKey();
    const first = encryptItem(userKey, ID_A, data);
    const edited = encryptItem(userKey, ID_A, { ...data, name: "Mail 2" }, first.encryptedKey);
    expect(edited.encryptedKey).toBe(first.encryptedKey);
    expect(decryptItem(userKey, ID_A, edited)).toMatchObject({ name: "Mail 2" });
  });

  it("accepts an uppercase id (UUIDs are case-insensitive)", () => {
    const userKey = generateSymmetricKey();
    const item = encryptItem(userKey, ID_A.toUpperCase(), data);
    expect(decryptItem(userKey, ID_A, item)).toEqual(data);
  });

  it("refuses a blob moved to another item id", () => {
    const userKey = generateSymmetricKey();
    const a = encryptItem(userKey, ID_A, data);
    expect(() => decryptItem(userKey, ID_B, a)).toThrow("decryption failed");
  });

  it("refuses data swapped in from another item", () => {
    const userKey = generateSymmetricKey();
    const a = encryptItem(userKey, ID_A, data);
    const b = encryptItem(userKey, ID_B, { ...data, name: "Other" });
    expect(() =>
      decryptItem(userKey, ID_A, { encryptedKey: a.encryptedKey, encryptedData: b.encryptedData }),
    ).toThrow("decryption failed");
  });

  it("refuses a key wrapped without the item binding", () => {
    const userKey = generateSymmetricKey();
    const a = encryptItem(userKey, ID_A, data);
    const unbound = wrapKey(userKey, generateSymmetricKey());
    expect(() =>
      decryptItem(userKey, ID_A, { encryptedKey: unbound, encryptedData: a.encryptedData }),
    ).toThrow("decryption failed");
  });

  it("fails with the wrong user key", () => {
    const item = encryptItem(generateSymmetricKey(), ID_A, data);
    expect(() => decryptItem(generateSymmetricKey(), ID_A, item)).toThrow(CryptoError);
  });

  it("rejects ids that aren't UUIDs", () => {
    expect(() => encryptItem(generateSymmetricKey(), "item-1", data)).toThrow("id must be a UUID");
  });

  it("reports data that isn't JSON as a CryptoError", () => {
    const userKey = generateSymmetricKey();
    const item = encryptItem(userKey, ID_A, data);
    const itemKey = unwrapItemKey(userKey, ID_A, item.encryptedKey);
    const notJson = encrypt(itemKey, utf8Encode("{nope"), utf8Encode(`item-data:${ID_A}`));
    expect(() =>
      decryptItem(userKey, ID_A, { encryptedKey: item.encryptedKey, encryptedData: notJson }),
    ).toThrow("item data is not valid JSON");
  });
});

describe("rewrapItemKey", () => {
  it("moves the key under another wrapping key; the data blob still opens", () => {
    const userKey = generateSymmetricKey();
    const lockboxKey = generateSymmetricKey();
    const item = encryptItem(userKey, ID_A, data);
    const encryptedKey = rewrapItemKey(userKey, lockboxKey, ID_A, item.encryptedKey);
    expect(decryptItem(lockboxKey, ID_A, { ...item, encryptedKey })).toEqual(data);
    expect(() => decryptItem(userKey, ID_A, { ...item, encryptedKey })).toThrow(CryptoError);
  });
});

describe("folder names", () => {
  it("round-trip and are bound to the folder id", () => {
    const userKey = generateSymmetricKey();
    const blob = encryptFolderName(userKey, ID_A, "Work ✓");
    expect(decryptFolderName(userKey, ID_A, blob)).toBe("Work ✓");
    expect(() => decryptFolderName(userKey, ID_B, blob)).toThrow("decryption failed");
  });

  it("can't be passed off as a wrapped item key (different label)", () => {
    const userKey = generateSymmetricKey();
    const key = generateSymmetricKey();
    const asFolderName = encrypt(userKey, key, utf8Encode(`folder-name:${ID_A}`));
    expect(() => unwrapItemKey(userKey, ID_A, asFolderName)).toThrow("decryption failed");
  });
});
