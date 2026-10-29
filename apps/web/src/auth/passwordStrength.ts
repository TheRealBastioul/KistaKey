// Rough master-password strength estimate for the signup meter. Guidance
// only: the one hard rule is MIN_PASSWORD_LENGTH. It estimates entropy from
// the character pool and penalizes what crackers try first (common
// passwords, repeats, sequences, keyboard runs, the user's own email).
import { MIN_PASSWORD_LENGTH } from "../config";

export type StrengthScore = 0 | 1 | 2 | 3 | 4;

export interface Strength {
  score: StrengthScore;
  label: string;
  /** Rough guess-resistance in bits. */
  bits: number;
  /** What would make it stronger (empty when it's already strong). */
  suggestions: string[];
  meetsMinimum: boolean;
}

const LABELS = ["Very weak", "Weak", "Fair", "Strong", "Very strong"] as const;

/** Score thresholds in bits: < 35 very weak, < 50 weak, < 65 fair, < 80 strong. */
const THRESHOLDS = [35, 50, 65, 80] as const;

/** Lowercased base words; a password that is one of these plus digits/symbols counts as common. */
const COMMON = new Set([
  "password",
  "passw0rd",
  "letmein",
  "welcome",
  "qwerty",
  "qwertyuiop",
  "asdfgh",
  "iloveyou",
  "admin",
  "administrator",
  "login",
  "master",
  "secret",
  "dragon",
  "monkey",
  "football",
  "baseball",
  "sunshine",
  "princess",
  "shadow",
  "superman",
  "trustno",
  "changeme",
  "abc",
  "abcdef",
  "abcdefgh",
  "summer",
  "winter",
  "spring",
  "autumn",
  "hello",
  "freedom",
  "whatever",
  "starwars",
  "pokemon",
  "computer",
  "internet",
  "default",
]);

const FORWARD = [
  "abcdefghijklmnopqrstuvwxyz",
  "01234567890",
  "qwertyuiop",
  "asdfghjkl",
  "zxcvbnm",
  "1qaz2wsx3edc",
];
const SEQUENCES = [...FORWARD, ...FORWARD.map((seq) => [...seq].reverse().join(""))];

function poolSize(password: string): number {
  let pool = 0;
  if (/[a-z]/.test(password)) pool += 26;
  if (/[A-Z]/.test(password)) pool += 26;
  if (/[0-9]/.test(password)) pool += 10;
  if (/[^a-zA-Z0-9\s\u0080-\u{10ffff}]/u.test(password)) pool += 33;
  if (/\s/.test(password)) pool += 1;
  if (/[\u0080-\u{10ffff}]/u.test(password)) pool += 100;
  return Math.max(pool, 1);
}

/** Characters that add little: repeats of the previous char, or steps along a known sequence. */
function predictableChars(password: string): number {
  const lower = password.toLowerCase();
  let count = 0;
  for (let i = 1; i < lower.length; i++) {
    const prev = lower[i - 1] ?? "";
    const cur = lower[i] ?? "";
    if (cur === prev) {
      count++;
      continue;
    }
    const pair = prev + cur;
    if (SEQUENCES.some((seq) => seq.includes(pair))) count++;
  }
  return count;
}

function isCommon(password: string): boolean {
  const lower = password.toLowerCase();
  if (COMMON.has(lower)) return true;
  // "Password123!", "!!qwerty2024": the letters are a common word.
  const letters = lower.replace(/[^a-z]/g, "");
  if (COMMON.has(letters)) return true;
  // Leetspeak, ignoring leading/trailing digits and symbols: p@ssw0rd2024 → password.
  const unleet = lower
    .replace(/^[^a-z]+|[^a-z]+$/g, "")
    .replace(/[@4]/g, "a")
    .replace(/3/g, "e")
    .replace(/[1!]/g, "i")
    .replace(/0/g, "o")
    .replace(/[$5]/g, "s")
    .replace(/[^a-z]/g, "");
  return COMMON.has(unleet);
}

function emailParts(email: string | undefined): string[] {
  if (!email) return [];
  const local = email.toLowerCase().split("@")[0] ?? "";
  return local.split(/[^a-z0-9]+/).filter((part) => part.length >= 3);
}

export function estimateStrength(password: string, email?: string): Strength {
  const meetsMinimum = [...password].length >= MIN_PASSWORD_LENGTH;
  const suggestions: string[] = [];

  if (!password) {
    return { score: 0, label: LABELS[0], bits: 0, suggestions, meetsMinimum };
  }

  const length = [...password].length;
  const effective = Math.max(length - predictableChars(password), 1);
  let bits = effective * Math.log2(poolSize(password));

  if (isCommon(password)) {
    bits = Math.min(bits, 10);
    suggestions.push("Avoid common passwords and simple variations of them.");
  }

  const lower = password.toLowerCase();
  if (emailParts(email).some((part) => lower.includes(part))) {
    bits *= 0.5;
    suggestions.push("Don't include your email address.");
  }

  if (predictableChars(password) >= length / 3) {
    suggestions.push("Avoid repeated characters and sequences like abc or 123.");
  }
  if (!meetsMinimum) {
    suggestions.push(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
  }

  const index = THRESHOLDS.findIndex((t) => bits < t);
  const score = (index === -1 ? 4 : index) as StrengthScore;

  if (score < 3 && suggestions.length === 0) {
    suggestions.push("Make it longer: a few random words make a strong, memorable passphrase.");
  }

  return { score, label: LABELS[score], bits: Math.round(bits), suggestions, meetsMinimum };
}
