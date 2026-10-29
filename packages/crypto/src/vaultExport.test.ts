import { beforeAll, describe, expect, it } from "vitest";
import { utf8Encode } from "./encoding";
import { CryptoError } from "./errors";
import { generateSymmetricKey } from "./keys";
import { ready } from "./sodium";
import { encrypt } from "./symmetric";
import { decryptVaultExport, encryptVaultExport } from "./vaultExport";

beforeAll(ready);

describe("vault export", () => {
  it("round-trips under the same user key", () => {
    const key = generateSymmetricKey();
    const json = JSON.stringify({ items: [{ name: "Café ☕", password: "p" }] });
    expect(decryptVaultExport(key, encryptVaultExport(key, json))).toBe(json);
  });

  it("another account's key can't open it", () => {
    const blob = encryptVaultExport(generateSymmetricKey(), "{}");
    expect(() => decryptVaultExport(generateSymmetricKey(), blob)).toThrow(CryptoError);
  });

  it("a blob encrypted for something else under the same key is refused", () => {
    const key = generateSymmetricKey();
    const other = encrypt(key, utf8Encode("{}"), utf8Encode("item-data:x"));
    expect(() => decryptVaultExport(key, other)).toThrow(CryptoError);
  });
});
