import { describe, expect, it } from "vitest";
import { isRecoveryCode, isTotpCode, normalizeRecoveryCode, normalizeTotpCode } from "./codes";

describe("TOTP codes", () => {
  it("strips spaces and dashes", () => {
    expect(normalizeTotpCode(" 123 456 ")).toBe("123456");
    expect(normalizeTotpCode("123-456")).toBe("123456");
  });

  it("accepts exactly six digits", () => {
    expect(isTotpCode("123 456")).toBe(true);
    expect(isTotpCode("12345")).toBe(false);
    expect(isTotpCode("1234567")).toBe(false);
    expect(isTotpCode("12345a")).toBe(false);
  });
});

describe("recovery codes", () => {
  it("trims and upper-cases, keeping separators", () => {
    expect(normalizeRecoveryCode("  abcde-fghjk ")).toBe("ABCDE-FGHJK");
  });

  it("accepts ten characters with or without separators", () => {
    expect(isRecoveryCode("ABCDE-FGHJK")).toBe(true);
    expect(isRecoveryCode("abcdefghjk")).toBe(true);
    expect(isRecoveryCode("abcde fghjk")).toBe(true);
  });

  it("rejects wrong lengths and characters", () => {
    expect(isRecoveryCode("ABCDE-FGHJ")).toBe(false);
    expect(isRecoveryCode("ABCDE-FGHJKL")).toBe(false);
    expect(isRecoveryCode("ABCDE_FGHJK")).toBe(false);
    expect(isRecoveryCode("")).toBe(false);
  });
});
