import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createDummyVerifier,
  hashSecret,
  hmac,
  openServerSecret,
  type SecretHashParams,
  safeEqual,
  sealServerSecret,
  verifySecret,
} from "./secrets";

// Cheap params so the suite stays fast; production uses DEFAULT_SECRET_HASH_PARAMS.
const FAST: SecretHashParams = { memoryKiB: 64, passes: 2, parallelism: 1 };

describe("hashSecret / verifySecret", () => {
  it("verifies the right secret only", async () => {
    const encoded = await hashSecret("auth-key", FAST);
    expect(encoded).toMatch(/^\$argon2id\$v=19\$m=64,t=2,p=1\$/);
    expect(encoded).not.toContain("auth-key");
    expect(await verifySecret("auth-key", encoded)).toBe(true);
    expect(await verifySecret("auth-kez", encoded)).toBe(false);
  });

  it("salts every hash", async () => {
    expect(await hashSecret("same", FAST)).not.toBe(await hashSecret("same", FAST));
  });

  it("treats malformed hashes as a mismatch", async () => {
    expect(await verifySecret("x", "not-a-hash")).toBe(false);
  });

  it("dummy verifier always fails", async () => {
    expect(await createDummyVerifier(FAST)("anything")).toBe(false);
  });
});

describe("server secrets (AES-256-GCM)", () => {
  const key = randomBytes(32);

  it("round-trips", () => {
    const blob = sealServerSecret(key, "JBSWY3DPEHPK3PXP");
    expect(blob.startsWith("v1.aesgcm.")).toBe(true);
    expect(openServerSecret(key, blob)).toBe("JBSWY3DPEHPK3PXP");
  });

  it("fails with another key or a tampered blob", () => {
    const blob = sealServerSecret(key, "secret");
    expect(() => openServerSecret(randomBytes(32), blob)).toThrow();
    const tampered = `${blob.slice(0, -2)}${blob.endsWith("AA") ? "BB" : "AA"}`;
    expect(() => openServerSecret(key, tampered)).toThrow();
  });
});

describe("helpers", () => {
  it("safeEqual compares exactly", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });

  it("hmac separates purposes", () => {
    const key = randomBytes(32);
    expect(hmac(key, "a", "x").equals(hmac(key, "b", "x"))).toBe(false);
  });
});
