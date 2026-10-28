import { beforeAll, describe, expect, it } from "vitest";
import { utf8Decode, utf8Encode } from "./encoding";
import { CryptoError } from "./errors";
import {
  generateKeyPair,
  generateSymmetricKey,
  openSealed,
  seal,
  unwrapKey,
  wrapKey,
} from "./keys";
import { ready } from "./sodium";
import { decrypt, encrypt } from "./symmetric";

beforeAll(ready);

/** Replaces one base64url character of a blob segment with a different valid one. */
function flipChar(blob: string, segment: number): string {
  const parts = blob.split(".");
  const target = parts[segment] ?? "";
  const first = target.charAt(0) === "A" ? "B" : "A";
  parts[segment] = first + target.slice(1);
  return parts.join(".");
}

describe("encrypt / decrypt", () => {
  it("round-trips, with and without aad", () => {
    const key = generateSymmetricKey();
    const message = utf8Encode("hunter2");
    expect(utf8Decode(decrypt(key, encrypt(key, message)))).toBe("hunter2");

    const aad = utf8Encode("item:1");
    expect(utf8Decode(decrypt(key, encrypt(key, message, aad), aad))).toBe("hunter2");
  });

  it("uses a fresh nonce every time", () => {
    const key = generateSymmetricKey();
    const message = utf8Encode("same");
    expect(encrypt(key, message)).not.toBe(encrypt(key, message));
  });

  it("writes the versioned blob format", () => {
    const blob = encrypt(generateSymmetricKey(), utf8Encode("x"));
    expect(blob).toMatch(/^v1\.xc20p\.[A-Za-z0-9_-]{32}\.[A-Za-z0-9_-]+$/);
  });

  it("fails with the wrong key", () => {
    const blob = encrypt(generateSymmetricKey(), utf8Encode("secret"));
    expect(() => decrypt(generateSymmetricKey(), blob)).toThrow(CryptoError);
  });

  it("fails with the wrong or missing aad", () => {
    const key = generateSymmetricKey();
    const blob = encrypt(key, utf8Encode("secret"), utf8Encode("item:1"));
    expect(() => decrypt(key, blob, utf8Encode("item:2"))).toThrow("decryption failed");
    expect(() => decrypt(key, blob)).toThrow("decryption failed");
  });

  it("detects a tampered ciphertext or nonce", () => {
    const key = generateSymmetricKey();
    const blob = encrypt(key, utf8Encode("secret"));
    expect(() => decrypt(key, flipChar(blob, 3))).toThrow("decryption failed");
    expect(() => decrypt(key, flipChar(blob, 2))).toThrow("decryption failed");
  });

  it("rejects another version or algorithm label", () => {
    const key = generateSymmetricKey();
    const blob = encrypt(key, utf8Encode("secret"));
    expect(() => decrypt(key, blob.replace(/^v1\./, "v2."))).toThrow("unsupported blob format");
    expect(() => decrypt(key, blob.replace(".xc20p.", ".aesgcm."))).toThrow(
      "unsupported blob format",
    );
  });

  it("rejects malformed blobs", () => {
    const key = generateSymmetricKey();
    expect(() => decrypt(key, "nonsense")).toThrow(CryptoError);
    expect(() => decrypt(key, "v1.xc20p.a.b.c")).toThrow(CryptoError);
    expect(() => decrypt(key, "v1.xc20p.!!!.abc")).toThrow(CryptoError);
  });

  it("rejects keys of the wrong length", () => {
    expect(() => encrypt(new Uint8Array(16), utf8Encode("x"))).toThrow("key must be 32 bytes");
  });
});

describe("wrapKey / unwrapKey", () => {
  it("round-trips a key", () => {
    const wrapping = generateSymmetricKey();
    const key = generateSymmetricKey();
    expect(unwrapKey(wrapping, wrapKey(wrapping, key))).toEqual(key);
  });

  it("refuses to unwrap something that isn't a 32-byte key", () => {
    const wrapping = generateSymmetricKey();
    expect(() => unwrapKey(wrapping, encrypt(wrapping, utf8Encode("short")))).toThrow(
      "unwrapped key must be 32 bytes",
    );
  });
});

describe("seal / openSealed", () => {
  it("round-trips to the keypair holder only", () => {
    const alice = generateKeyPair();
    const mallory = generateKeyPair();
    const key = generateSymmetricKey();
    const blob = seal(alice.publicKey, key);

    expect(blob.startsWith("v1.x25519sealed.")).toBe(true);
    expect(openSealed(alice, blob)).toEqual(key);
    expect(() => openSealed(mallory, blob)).toThrow("decryption failed");
  });

  it("detects tampering", () => {
    const alice = generateKeyPair();
    const blob = seal(alice.publicKey, generateSymmetricKey());
    expect(() => openSealed(alice, flipChar(blob, 2))).toThrow("decryption failed");
    expect(() => openSealed(alice, blob.replace(/^v1\./, "v9."))).toThrow("unsupported");
  });
});
