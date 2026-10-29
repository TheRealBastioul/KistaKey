// Password health (decisions §20), computed in the browser only: nothing
// about it (not even a hash) leaves the device. Looks at live login items
// with a password and flags:
//   weak   — strength score ≤ 2 (zxcvbn-ts, ./strength.ts)
//   reused — the same password on another live item (exact match, in memory)
//   old    — password not changed for 365 days
// The scorer is injected so this file stays pure and testable.
import type { VaultEntry } from "./store";

export type HealthIssue = "weak" | "reused" | "old";
export const HEALTH_ISSUES: readonly HealthIssue[] = ["weak", "reused", "old"];

export const WEAK_MAX_SCORE = 2;
export const OLD_AFTER_DAYS = 365;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Strength 0–4 of an entry's password. */
export type EntryScorer = (entry: VaultEntry) => number;

export interface HealthReport {
  /** Live login items with a password (the ones checked). */
  checked: number;
  weak: VaultEntry[];
  /** Groups of entries sharing one password, biggest first; each has ≥ 2. */
  reusedGroups: VaultEntry[][];
  old: VaultEntry[];
  /** Issues per entry id (only entries with at least one). */
  issues: Map<string, HealthIssue[]>;
}

/** The entry's password, or "" (not a login, unreadable, trashed or empty). */
export function checkedPassword(entry: VaultEntry): string {
  if (entry.deletedAt !== null || entry.type !== "login") return "";
  return entry.data?.login?.password ?? "";
}

/**
 * When the current password was set: the newest password-history entry
 * (written when it replaced the previous one), else the item's creation.
 * Other edits (name, favorite…) don't count.
 */
export function passwordSetAt(entry: VaultEntry): Date {
  const last = entry.data?.passwordHistory[0]?.changedAt;
  return new Date(last ?? entry.createdAt);
}

/** Words zxcvbn should treat as guessable for this entry: name, username, site hosts. */
export function userInputs(entry: VaultEntry): string[] {
  const data = entry.data;
  if (!data) return [];
  const inputs = [data.name, data.login?.username ?? ""];
  for (const { uri } of data.login?.uris ?? []) {
    try {
      inputs.push(new URL(uri).hostname.replace(/^www\./, ""));
    } catch {
      inputs.push(uri);
    }
  }
  return inputs.filter((s) => s.length > 0);
}

export function computeHealth(
  entries: VaultEntry[],
  score: EntryScorer,
  now = new Date(),
): HealthReport {
  const issues = new Map<string, HealthIssue[]>();
  const flag = (entry: VaultEntry, issue: HealthIssue) =>
    issues.set(entry.id, [...(issues.get(entry.id) ?? []), issue]);

  const weak: VaultEntry[] = [];
  const old: VaultEntry[] = [];
  const byPassword = new Map<string, VaultEntry[]>();
  const oldBefore = now.getTime() - OLD_AFTER_DAYS * DAY_MS;
  let checked = 0;

  for (const entry of entries) {
    const password = checkedPassword(entry);
    if (!password) continue;
    checked++;
    if (score(entry) <= WEAK_MAX_SCORE) {
      weak.push(entry);
      flag(entry, "weak");
    }
    byPassword.set(password, [...(byPassword.get(password) ?? []), entry]);
    if (passwordSetAt(entry).getTime() < oldBefore) {
      old.push(entry);
      flag(entry, "old");
    }
  }

  const reusedGroups = [...byPassword.values()]
    .filter((group) => group.length > 1)
    .sort((a, b) => b.length - a.length);
  for (const group of reusedGroups) for (const entry of group) flag(entry, "reused");

  return { checked, weak, reusedGroups, old, issues };
}

/** Whether the entry has this issue. */
export function hasIssue(report: HealthReport, id: string, issue: HealthIssue): boolean {
  return report.issues.get(id)?.includes(issue) ?? false;
}

/**
 * Caches scores by item id + revision (an edit gets a new revision), so a
 * sync only scores what changed. Holds numbers, never passwords.
 */
export function createScoreCache(scorePassword: (password: string, inputs: string[]) => number) {
  let cache = new Map<string, number>();
  const scorer: EntryScorer = (entry) => {
    const key = `${entry.id}:${entry.revision}`;
    let value = cache.get(key);
    if (value === undefined) {
      value = scorePassword(checkedPassword(entry), userInputs(entry));
      cache.set(key, value);
    }
    return value;
  };
  return {
    scorer,
    clear() {
      cache = new Map();
    },
  };
}
