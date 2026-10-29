import { describe, expect, it } from "vitest";
import { CryptoError } from "./errors";
import {
  AMBIGUOUS_CHARACTERS,
  CHARACTER_SETS,
  DEFAULT_PASSPHRASE_OPTIONS,
  DEFAULT_PASSWORD_OPTIONS,
  generatedEntropyBits,
  generatePassphrase,
  generatePassword,
  randomInt,
} from "./generator";
import { EFF_LONG_WORDLIST } from "./wordlist";

/** Pearson's chi-squared statistic against a uniform distribution. */
function chiSquared(counts: number[]): number {
  const total = counts.reduce((a, b) => a + b, 0);
  const expected = total / counts.length;
  return counts.reduce((sum, c) => sum + (c - expected) ** 2 / expected, 0);
}

/** 9 degrees of freedom: p < 1e-6, so a correct generator practically never fails it. */
const CHI2_LIMIT_9_DOF = 50;

describe("EFF long wordlist", () => {
  it("has 7,776 unique lowercase words in dice order", () => {
    expect(EFF_LONG_WORDLIST).toHaveLength(7776);
    expect(new Set(EFF_LONG_WORDLIST).size).toBe(7776);
    expect(EFF_LONG_WORDLIST[0]).toBe("abacus");
    expect(EFF_LONG_WORDLIST[7775]).toBe("zoom");
    for (const word of EFF_LONG_WORDLIST) expect(word).toMatch(/^[a-z]+(-[a-z]+)*$/);
  });
});

describe("randomInt", () => {
  it("stays in range", () => {
    for (let i = 0; i < 1000; i++) {
      const n = randomInt(7);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(7);
    }
  });

  it("is roughly uniform", () => {
    const counts = new Array<number>(10).fill(0);
    for (let i = 0; i < 50_000; i++) {
      const n = randomInt(10);
      counts[n] = (counts[n] ?? 0) + 1;
    }
    expect(chiSquared(counts)).toBeLessThan(CHI2_LIMIT_9_DOF);
  });

  it("rejects bad bounds", () => {
    expect(() => randomInt(0)).toThrow(CryptoError);
    expect(() => randomInt(1.5)).toThrow(CryptoError);
  });
});

describe("generatePassword", () => {
  it("respects the length", () => {
    for (const length of [5, 20, 128]) {
      expect(generatePassword({ ...DEFAULT_PASSWORD_OPTIONS, length })).toHaveLength(length);
    }
  });

  it("includes at least one character of every enabled set, and nothing else", () => {
    for (let i = 0; i < 200; i++) {
      const password = generatePassword({ ...DEFAULT_PASSWORD_OPTIONS, length: 5 });
      for (const set of Object.values(CHARACTER_SETS)) {
        expect([...password].some((ch) => set.includes(ch))).toBe(true);
      }
    }
  });

  it("uses only the enabled sets", () => {
    const password = generatePassword({
      ...DEFAULT_PASSWORD_OPTIONS,
      length: 64,
      uppercase: false,
      symbols: false,
    });
    expect(password).toMatch(/^[a-z0-9]+$/);
  });

  it("spreads characters evenly over the pool", () => {
    const digitsOnly = {
      ...DEFAULT_PASSWORD_OPTIONS,
      length: 100,
      lowercase: false,
      uppercase: false,
      symbols: false,
    };
    const counts = new Array<number>(10).fill(0);
    for (let i = 0; i < 1000; i++) {
      for (const ch of generatePassword(digitsOnly))
        counts[Number(ch)] = (counts[Number(ch)] ?? 0) + 1;
    }
    expect(chiSquared(counts)).toBeLessThan(CHI2_LIMIT_9_DOF);
  });

  it("leaves out ambiguous characters when asked", () => {
    for (let i = 0; i < 50; i++) {
      const password = generatePassword({
        ...DEFAULT_PASSWORD_OPTIONS,
        length: 128,
        avoidAmbiguous: true,
      });
      for (const ch of AMBIGUOUS_CHARACTERS) expect(password).not.toContain(ch);
    }
  });

  it("rejects bad options", () => {
    expect(() => generatePassword({ ...DEFAULT_PASSWORD_OPTIONS, length: 4 })).toThrow(CryptoError);
    expect(() => generatePassword({ ...DEFAULT_PASSWORD_OPTIONS, length: 129 })).toThrow(
      CryptoError,
    );
    expect(() =>
      generatePassword({
        ...DEFAULT_PASSWORD_OPTIONS,
        lowercase: false,
        uppercase: false,
        digits: false,
        symbols: false,
      }),
    ).toThrow("enable at least one character set");
  });
});

describe("generatePassphrase", () => {
  it("joins the requested number of list words", () => {
    const words = generatePassphrase({ ...DEFAULT_PASSPHRASE_OPTIONS, words: 6 }).split("-");
    expect(words).toHaveLength(6);
    for (const word of words) expect(EFF_LONG_WORDLIST).toContain(word);
  });

  it("capitalizes, uses the separator and appends one digit", () => {
    const phrase = generatePassphrase({
      words: 4,
      separator: " ",
      capitalize: true,
      includeNumber: true,
    });
    const words = phrase.split(" ");
    expect(words).toHaveLength(4);
    for (const word of words) expect(word).toMatch(/^[A-Z]/);
    expect(phrase.match(/\d/g)).toHaveLength(1);
  });

  it("allows an empty separator", () => {
    const phrase = generatePassphrase({ ...DEFAULT_PASSPHRASE_OPTIONS, separator: "" });
    expect(phrase).toMatch(/^[a-z-]+$/);
  });

  it("rejects bad options", () => {
    expect(() => generatePassphrase({ ...DEFAULT_PASSPHRASE_OPTIONS, words: 2 })).toThrow(
      CryptoError,
    );
    expect(() => generatePassphrase({ ...DEFAULT_PASSPHRASE_OPTIONS, words: 21 })).toThrow(
      CryptoError,
    );
    expect(() => generatePassphrase({ ...DEFAULT_PASSPHRASE_OPTIONS, separator: "----" })).toThrow(
      "separator",
    );
  });
});

describe("generatedEntropyBits", () => {
  it("matches log2 of the pool / list", () => {
    expect(
      generatedEntropyBits({
        kind: "password",
        ...DEFAULT_PASSWORD_OPTIONS,
        length: 10,
        uppercase: false,
        symbols: false,
      }),
    ).toBeCloseTo(10 * Math.log2(36));
    expect(
      generatedEntropyBits({ kind: "passphrase", ...DEFAULT_PASSPHRASE_OPTIONS, words: 5 }),
    ).toBeCloseTo(5 * Math.log2(7776));
  });
});
