import { describe, expect, it } from "vitest";
import {
  base32Decode,
  base32Encode,
  generateTotpSecret,
  hotp,
  otpauthUri,
  totpStep,
  verifyTotp,
} from "./totp";

// RFC 6238 Appendix B, SHA-1 column (8 digits).
const RFC_KEY = Buffer.from("12345678901234567890", "ascii");
const RFC_VECTORS: [number, string][] = [
  [59, "94287082"],
  [1111111109, "07081804"],
  [1111111111, "14050471"],
  [1234567890, "89005924"],
  [2000000000, "69279037"],
  [20000000000, "65353130"],
];

describe("hotp / totp", () => {
  it.each(RFC_VECTORS)("matches RFC 6238 at T=%i", (seconds, expected) => {
    expect(hotp(RFC_KEY, totpStep(seconds * 1000), 8)).toBe(expected);
  });

  it("base32 round-trips", () => {
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(base32Encode(base32Decode(secret))).toBe(secret);
    expect(base32Encode(RFC_KEY)).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
  });

  const secret = base32Encode(RFC_KEY);
  const nowMs = 1111111111 * 1000;
  const codeAt = (offsetSteps: number) => hotp(RFC_KEY, totpStep(nowMs) + offsetSteps);

  it("accepts the current, previous and next step", () => {
    for (const offset of [-1, 0, 1]) {
      expect(verifyTotp(secret, codeAt(offset), { nowMs, lastUsedStep: null })).toBe(
        totpStep(nowMs) + offset,
      );
    }
  });

  it("rejects codes outside the window", () => {
    expect(verifyTotp(secret, codeAt(2), { nowMs, lastUsedStep: null })).toBeNull();
    expect(verifyTotp(secret, codeAt(-2), { nowMs, lastUsedStep: null })).toBeNull();
  });

  it("blocks replay of the same or an older step", () => {
    const step = totpStep(nowMs);
    expect(verifyTotp(secret, codeAt(0), { nowMs, lastUsedStep: step })).toBeNull();
    expect(verifyTotp(secret, codeAt(-1), { nowMs, lastUsedStep: step })).toBeNull();
    expect(verifyTotp(secret, codeAt(1), { nowMs, lastUsedStep: step })).toBe(step + 1);
  });

  it("rejects malformed codes", () => {
    expect(verifyTotp(secret, "12345", { nowMs, lastUsedStep: null })).toBeNull();
    expect(verifyTotp(secret, "abcdef", { nowMs, lastUsedStep: null })).toBeNull();
  });

  it("builds an otpauth URI authenticator apps understand", () => {
    const uri = otpauthUri({ issuer: "Acme", account: "a@b.c", secret: "ABC" });
    expect(uri).toBe(
      "otpauth://totp/Acme%3Aa%40b.c?secret=ABC&issuer=Acme&algorithm=SHA1&digits=6&period=30",
    );
  });
});
