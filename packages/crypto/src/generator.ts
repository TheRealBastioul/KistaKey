// Password and passphrase generator. Randomness is crypto.getRandomValues
// with rejection sampling, so every character and word is exactly equally
// likely (no modulo bias). Doesn't need ready().
import { CryptoError } from "./errors";
import { EFF_LONG_WORDLIST } from "./wordlist";

export const CHARACTER_SETS = {
  lowercase: "abcdefghijklmnopqrstuvwxyz",
  uppercase: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  digits: "0123456789",
  /** Accepted by almost every site's password rules. */
  symbols: "!#$%&*+-=?@^_",
} as const;
export type CharacterSet = keyof typeof CHARACTER_SETS;

/** Characters that are easy to misread: dropped when `avoidAmbiguous` is on. */
export const AMBIGUOUS_CHARACTERS = "Il1O0o";

export interface PasswordOptions {
  /** 5–128 */
  length: number;
  lowercase: boolean;
  uppercase: boolean;
  digits: boolean;
  symbols: boolean;
  avoidAmbiguous: boolean;
}

export interface PassphraseOptions {
  /** 3–20 */
  words: number;
  /** 0–3 characters between words. */
  separator: string;
  capitalize: boolean;
  /** Appends one random digit to one random word. */
  includeNumber: boolean;
}

export const DEFAULT_PASSWORD_OPTIONS: PasswordOptions = {
  length: 20,
  lowercase: true,
  uppercase: true,
  digits: true,
  symbols: true,
  avoidAmbiguous: false,
};

export const DEFAULT_PASSPHRASE_OPTIONS: PassphraseOptions = {
  words: 5,
  separator: "-",
  capitalize: false,
  includeNumber: false,
};

export const GENERATOR_LIMITS = {
  length: { min: 5, max: 128 },
  words: { min: 3, max: 20 },
  separatorChars: { max: 3 },
} as const;

const UINT32_RANGE = 2 ** 32;

/** Uniform integer in [0, max). Rejects the top partial range of a uint32 to avoid bias. */
export function randomInt(max: number): number {
  if (!Number.isInteger(max) || max < 1 || max > UINT32_RANGE) {
    throw new CryptoError("randomInt max must be an integer in [1, 2^32]");
  }
  const limit = UINT32_RANGE - (UINT32_RANGE % max);
  const buffer = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buffer);
    const value = buffer[0] ?? 0;
    if (value < limit) return value % max;
  }
}

function pick(chars: string): string {
  return chars.charAt(randomInt(chars.length));
}

/** Fisher–Yates with unbiased indexes. */
function shuffle<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [items[i], items[j]] = [items[j] as T, items[i] as T];
  }
  return items;
}

function assertRange(value: number, { min, max }: { min: number; max: number }, what: string) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new CryptoError(`${what} must be an integer in [${min}, ${max}]`);
  }
}

/** The character pool of each enabled set, after removing ambiguous characters. */
export function enabledSets(options: PasswordOptions): string[] {
  const sets: string[] = [];
  for (const name of Object.keys(CHARACTER_SETS) as CharacterSet[]) {
    if (!options[name]) continue;
    let chars: string = CHARACTER_SETS[name];
    if (options.avoidAmbiguous) {
      chars = [...chars].filter((ch) => !AMBIGUOUS_CHARACTERS.includes(ch)).join("");
    }
    sets.push(chars);
  }
  return sets;
}

/** At least one character from every enabled set; the rest from all of them. */
export function generatePassword(options: PasswordOptions = DEFAULT_PASSWORD_OPTIONS): string {
  assertRange(options.length, GENERATOR_LIMITS.length, "password length");
  const sets = enabledSets(options);
  if (sets.length === 0) throw new CryptoError("enable at least one character set");
  const all = sets.join("");
  const chars = sets.map(pick);
  while (chars.length < options.length) chars.push(pick(all));
  return shuffle(chars).join("");
}

export function generatePassphrase(
  options: PassphraseOptions = DEFAULT_PASSPHRASE_OPTIONS,
): string {
  assertRange(options.words, GENERATOR_LIMITS.words, "word count");
  if ([...options.separator].length > GENERATOR_LIMITS.separatorChars.max) {
    throw new CryptoError(
      `separator must be at most ${GENERATOR_LIMITS.separatorChars.max} characters`,
    );
  }
  const words = Array.from({ length: options.words }, () => {
    const word = EFF_LONG_WORDLIST[randomInt(EFF_LONG_WORDLIST.length)] ?? "";
    return options.capitalize ? word.charAt(0).toUpperCase() + word.slice(1) : word;
  });
  if (options.includeNumber) {
    const i = randomInt(words.length);
    words[i] = `${words[i]}${randomInt(10)}`;
  }
  return words.join(options.separator);
}

/**
 * Entropy of the generator's output in bits (what the UI shows as
 * strength). Password: length × log2(pool), a slight overestimate because
 * of the one-per-set rule. Passphrase: words × log2(7776), plus the digit
 * and its position when `includeNumber` is on.
 */
export function generatedEntropyBits(
  options: ({ kind: "password" } & PasswordOptions) | ({ kind: "passphrase" } & PassphraseOptions),
): number {
  if (options.kind === "password") {
    const pool = enabledSets(options).join("").length;
    return pool === 0 ? 0 : options.length * Math.log2(pool);
  }
  const bits = options.words * Math.log2(EFF_LONG_WORDLIST.length);
  return options.includeNumber ? bits + Math.log2(10 * options.words) : bits;
}
