import { describe, expect, it } from "vitest";
import { estimateStrength } from "./passwordStrength";

describe("estimateStrength", () => {
  it("empty is very weak and below the minimum", () => {
    const s = estimateStrength("");
    expect(s.score).toBe(0);
    expect(s.meetsMinimum).toBe(false);
  });

  it("enforces the minimum length only through meetsMinimum", () => {
    expect(estimateStrength("vT9#qL2!mZ7").meetsMinimum).toBe(false);
    expect(estimateStrength("vT9#qL2!mZ7@").meetsMinimum).toBe(true);
    expect(estimateStrength("vT9#qL2!mZ7").suggestions.join(" ")).toMatch(/at least 12/);
  });

  it("common passwords and their variations are very weak", () => {
    for (const pw of ["Password123!", "p@ssw0rd2024", "!!qwerty2024", "letmein"]) {
      const s = estimateStrength(pw);
      expect(s.score, pw).toBe(0);
      expect(s.suggestions.join(" "), pw).toMatch(/common/);
    }
  });

  it("repeats and sequences don't count as length", () => {
    expect(estimateStrength("aaaaaaaaaaaaaaaa").score).toBe(0);
    expect(estimateStrength("abcdefghijklmnop").score).toBe(0);
    expect(estimateStrength("1234567890123456").score).toBe(0);
  });

  it("penalizes the email's local part", () => {
    const pw = "alicesmith-Tx7#-q";
    const without = estimateStrength(pw);
    const withEmail = estimateStrength(pw, "alice.smith@example.com");
    expect(withEmail.bits).toBeLessThan(without.bits);
    expect(withEmail.suggestions.join(" ")).toMatch(/email/);
  });

  it("long random passwords and passphrases are strong", () => {
    expect(estimateStrength("vT9#qL2!mZ7@wR4$").score).toBe(4);
    expect(estimateStrength("correct horse battery staple").score).toBeGreaterThanOrEqual(3);
  });

  it("scores rise with length", () => {
    const short = estimateStrength("vT9#qL2!");
    const long = estimateStrength("vT9#qL2!mZ7@wR4$");
    expect(long.bits).toBeGreaterThan(short.bits);
    expect(long.score).toBeGreaterThan(short.score);
  });
});
