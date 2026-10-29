// Known-answer tests: fixed inputs -> fixed expected outputs, stored as
// JSON in test/vectors/. The same vector files are run by the mobile
// native modules (Phases 31–34), which is what proves every platform derives
// and decrypts identically. Never regenerate a vector to make a test pass.
//
// The vectors were generated with libsodium directly, and the Argon2id,
// HKDF and X25519 outputs cross-checked against Node's own crypto. Item and
// folder blobs (Phase 6) come from libsodium directly too; the TOTP cases are
// the RFC 6238 appendix B table (secrets base32-encoded) plus a few
// node:crypto HMAC results for 6/7 digits and a 60 s period.
import { beforeAll, describe, expect, it } from "vitest";
import { fromHex, toBase64Url, toHex } from "../src/encoding";
import { decryptFolderName, decryptItem, unwrapItemKey } from "../src/items";
import { deriveMasterKey, deriveSubKeys } from "../src/kdf";
import { keyPairFromPrivateKey, openSealed, unwrapKey } from "../src/keys";
import { deriveRecoveryKeys, formatRecoveryKey, parseRecoveryKey } from "../src/recovery";
import { ready } from "../src/sodium";
import { decrypt, encryptWithNonce } from "../src/symmetric";
import { type TotpAlgorithm, totpCode } from "../src/totp";
import { CRYPTO_FORMAT_VERSION } from "../src/version";
import vectors from "./vectors/known-answer.json";

// Partial because the JSON import types each case as the union of every
// case's fields, so fields a case doesn't use come through as undefined.
type Fields = Partial<Record<string, string>>;

interface KnownAnswerCase {
  name: string;
  operation: string;
  input: Fields;
  expected: Fields;
}

const cases = vectors.cases as KnownAnswerCase[];

function field(record: Fields, name: string): string {
  const value = record[name];
  if (value === undefined) throw new Error(`vector is missing "${name}"`);
  return value;
}

type Runner = (input: Fields) => Promise<Record<string, string>>;

/** One runner per operation; every runner also checks the inverse where there is one. */
const RUNNERS: Record<string, Runner> = {
  "kdf.argon2id": async (input) => ({
    masterKey: toHex(
      deriveMasterKey(field(input, "password"), fromHex(field(input, "salt")), {
        alg: "argon2id",
        memoryKiB: Number(field(input, "memoryKiB")),
        iterations: Number(field(input, "iterations")),
        parallelism: Number(field(input, "parallelism")),
      }),
    ),
  }),

  "kdf.subkeys": async (input) => {
    const { authKey, encKey } = await deriveSubKeys(fromHex(field(input, "masterKey")));
    return { authKey: toHex(authKey), encKey: toHex(encKey) };
  },

  "symmetric.encrypt": async (input) => {
    const key = fromHex(field(input, "key"));
    const aad = fromHex(field(input, "aad"));
    const blob = encryptWithNonce(
      key,
      fromHex(field(input, "plaintext")),
      fromHex(field(input, "nonce")),
      aad,
    );
    expect(toHex(decrypt(key, blob, aad))).toBe(field(input, "plaintext"));
    return { blob };
  },

  "key.unwrap": async (input) => ({
    key: toHex(unwrapKey(fromHex(field(input, "wrappingKey")), field(input, "blob"))),
  }),

  "keypair.from_private": async (input) => ({
    publicKey: toHex(keyPairFromPrivateKey(fromHex(field(input, "privateKey"))).publicKey),
  }),

  "sealed.open": async (input) => {
    const keyPair = keyPairFromPrivateKey(fromHex(field(input, "privateKey")));
    return { plaintext: toHex(openSealed(keyPair, field(input, "blob"))) };
  },

  "recovery.format": async (input) => {
    const formatted = formatRecoveryKey(fromHex(field(input, "key")));
    expect(toHex(parseRecoveryKey(formatted))).toBe(field(input, "key"));
    return { formatted };
  },

  "recovery.derive": async (input) => {
    const { authKey, wrapKey } = await deriveRecoveryKeys(fromHex(field(input, "key")));
    return { authKey: toHex(authKey), wrapKey: toHex(wrapKey) };
  },

  "encoding.base64url": async (input) => ({
    text: toBase64Url(fromHex(field(input, "bytes"))),
  }),

  "item.decrypt": async (input) => {
    const wrappingKey = fromHex(field(input, "wrappingKey"));
    const itemId = field(input, "itemId");
    const item = {
      encryptedKey: field(input, "encryptedKey"),
      encryptedData: field(input, "encryptedData"),
    };
    return {
      itemKey: toHex(unwrapItemKey(wrappingKey, itemId, item.encryptedKey)),
      json: JSON.stringify(decryptItem(wrappingKey, itemId, item)),
    };
  },

  "folder.decrypt_name": async (input) => ({
    name: decryptFolderName(
      fromHex(field(input, "wrappingKey")),
      field(input, "folderId"),
      field(input, "encryptedName"),
    ),
  }),

  "totp.code": async (input) => ({
    code: await totpCode(
      {
        secret: field(input, "secret"),
        algorithm: field(input, "algorithm") as TotpAlgorithm,
        digits: Number(field(input, "digits")),
        period: Number(field(input, "period")),
      },
      Number(field(input, "time")) * 1000,
    ),
  }),
};

describe("known-answer vectors", () => {
  beforeAll(ready);

  it("vector file matches the current format version", () => {
    expect(vectors.formatVersion).toBe(CRYPTO_FORMAT_VERSION);
  });

  it("every case is well-formed and has a runner", () => {
    for (const c of cases) {
      expect(c.name).toBeTruthy();
      expect(RUNNERS[c.operation], c.operation).toBeTypeOf("function");
      expect(c.input).toBeTypeOf("object");
      expect(c.expected).toBeTypeOf("object");
    }
  });

  it.each(cases.map((c) => [c.name, c] as const))("%s", async (_name, c) => {
    const run = RUNNERS[c.operation];
    if (!run) throw new Error(`no runner for ${c.operation}`);
    expect(await run(c.input)).toEqual(c.expected);
  });
});
