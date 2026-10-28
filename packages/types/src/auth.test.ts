import { describe, expect, it } from "vitest";
import { KdfParamsSchema } from "./auth";
import { EmailSchema, EncryptedBlobSchema, Key32Schema } from "./common";

describe("EmailSchema", () => {
  it("trims and lowercases", () => {
    expect(EmailSchema.parse("  Alice@Example.COM ")).toBe("alice@example.com");
  });

  it("rejects non-emails", () => {
    expect(EmailSchema.safeParse("alice").success).toBe(false);
  });
});

describe("KdfParamsSchema", () => {
  const ok = { alg: "argon2id", memoryKiB: 65536, iterations: 3, parallelism: 1 };

  it("accepts the defaults", () => {
    expect(KdfParamsSchema.safeParse(ok).success).toBe(true);
  });

  it.each([{ memoryKiB: 1024 }, { iterations: 1 }, { parallelism: 4 }, { alg: "pbkdf2" }])(
    "rejects %o",
    (override) => {
      expect(KdfParamsSchema.safeParse({ ...ok, ...override }).success).toBe(false);
    },
  );
});

describe("key and blob formats", () => {
  it("Key32Schema wants exactly 43 base64url chars", () => {
    expect(Key32Schema.safeParse("A".repeat(43)).success).toBe(true);
    expect(Key32Schema.safeParse("A".repeat(44)).success).toBe(false);
    expect(Key32Schema.safeParse(`${"A".repeat(42)}+`).success).toBe(false);
  });

  it("EncryptedBlobSchema accepts @repo/crypto blobs only", () => {
    expect(EncryptedBlobSchema.safeParse("v1.xc20p.QUJD.REVG").success).toBe(true);
    expect(EncryptedBlobSchema.safeParse("v1.x25519sealed.QUJD").success).toBe(true);
    expect(EncryptedBlobSchema.safeParse("plaintext password").success).toBe(false);
  });
});
