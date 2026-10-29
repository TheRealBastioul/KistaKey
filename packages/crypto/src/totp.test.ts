// RFC 6238 vectors for every hash live in test/vectors/known-answer.json;
// these cover parsing, validation and the timing helpers.
import { describe, expect, it } from "vitest";
import { CryptoError } from "./errors";
import { decodeBase32, normalizeTotpSecret, totpCode, totpSecondsRemaining } from "./totp";

/** base32 of "12345678901234567890" (the RFC 6238 SHA1 secret). */
const RFC_SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

describe("base32 secrets", () => {
  it("decodes RFC 4648 base32", () => {
    expect(new TextDecoder().decode(decodeBase32(RFC_SECRET))).toBe("12345678901234567890");
  });

  it("forgives case, spaces and padding", () => {
    expect(normalizeTotpSecret(" gezd gnbv gy3t qojq gezd gnbv gy3t qojq ")).toBe(RFC_SECRET);
    expect(normalizeTotpSecret("MZXW6===")).toBe("MZXW6");
  });

  it.each(["", "ABC1", "GEZDGNBV!", "A", "ABC"])("rejects %j", (secret) => {
    expect(() => normalizeTotpSecret(secret)).toThrow(CryptoError);
  });

  it("rejects secrets over 128 bytes", () => {
    expect(() => normalizeTotpSecret("A".repeat(208))).toThrow("TOTP secret must be");
  });
});

describe("totpCode", () => {
  const params = { secret: RFC_SECRET, algorithm: "SHA1", digits: 6, period: 30 } as const;

  it("keeps the code for the whole period", async () => {
    const start = 1_700_000_010_000; // 1_700_000_010 is a multiple of 30
    expect(await totpCode(params, start)).toBe(await totpCode(params, start + 29_999));
    expect(await totpCode(params, start)).not.toBe(await totpCode(params, start + 30_000));
  });

  it("returns exactly `digits` digits", async () => {
    for (const digits of [6, 7, 8]) {
      expect(await totpCode({ ...params, digits }, 59_000)).toMatch(new RegExp(`^\\d{${digits}}$`));
    }
  });

  it.each([
    { digits: 5 },
    { digits: 9 },
    { period: 0 },
    { period: 301 },
    { period: 1.5 },
    { algorithm: "MD5" },
  ])("rejects %o", async (override) => {
    await expect(totpCode({ ...params, ...override } as never, 0)).rejects.toThrow(CryptoError);
  });
});

describe("totpSecondsRemaining", () => {
  it("counts down from period to 1", () => {
    expect(totpSecondsRemaining(30, 60_000)).toBe(30);
    expect(totpSecondsRemaining(30, 60_999)).toBe(30);
    expect(totpSecondsRemaining(30, 89_000)).toBe(1);
  });
});
