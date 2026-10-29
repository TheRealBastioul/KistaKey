import { type ItemDataInput, ItemDataSchema, type ItemType } from "@repo/types";
import { describe, expect, it, vi } from "vitest";
import {
  checkedPassword,
  computeHealth,
  createScoreCache,
  type EntryScorer,
  hasIssue,
  passwordSetAt,
  userInputs,
} from "./health";
import { filterItems, filterParam, parseFilter } from "./search";
import type { VaultEntry } from "./store";

const NOW = new Date("2026-10-28T12:00:00.000Z");
const RECENT = "2026-09-01T00:00:00.000Z";
const TWO_YEARS_AGO = "2024-10-01T00:00:00.000Z";

function entry(
  id: string,
  input: ItemDataInput,
  opts: { type?: ItemType; trashed?: boolean; createdAt?: string; revision?: number } = {},
): VaultEntry {
  const data = ItemDataSchema.parse(input);
  const createdAt = opts.createdAt ?? RECENT;
  return {
    id,
    type: opts.type ?? "login",
    folderId: null,
    revision: opts.revision ?? 1,
    createdAt,
    updatedAt: createdAt,
    deletedAt: opts.trashed ? RECENT : null,
    data,
    name: data.name,
    search: data.name.toLowerCase(),
    encrypted: {} as VaultEntry["encrypted"],
  };
}

const login = (name: string, password: string, extra: Partial<ItemDataInput> = {}) => ({
  name,
  login: { username: "me", password, uris: [] },
  ...extra,
});

/** Fake strength: "weak…" passwords score 1, everything else 4. */
const fakeScore: EntryScorer = (e) => (checkedPassword(e).startsWith("weak") ? 1 : 4);

describe("computeHealth", () => {
  const items = [
    entry("a", login("Mail", "weak1")),
    entry("b", login("Bank", "Shared-Strong-1")),
    entry("c", login("Shop", "Shared-Strong-1")),
    entry("d", login("Forum", "Shared-Strong-1")),
    entry("e", login("Old", "Unique-Strong-2"), { createdAt: TWO_YEARS_AGO }),
    entry("f", login("Fine", "Unique-Strong-3")),
    entry("g", login("Pair 1", "pair-pass")),
    entry("h", login("Pair 2", "pair-pass")),
    // Not checked: trashed, empty password, not a login, unreadable.
    entry("t", login("Trashed", "Shared-Strong-1"), { trashed: true }),
    entry("x", login("Empty", "")),
    entry("n", { name: "Note", note: "weak-note" }, { type: "note" }),
    { ...entry("u", login("Unreadable", "x")), data: null },
  ];
  const report = computeHealth(items, fakeScore, NOW);

  it("counts only live login items with a password", () => {
    expect(report.checked).toBe(8);
  });

  it("flags weak passwords by score ≤ 2", () => {
    expect(report.weak.map((e) => e.id)).toEqual(["a"]);
    expect(hasIssue(report, "a", "weak")).toBe(true);
    expect(hasIssue(report, "f", "weak")).toBe(false);
  });

  it("groups reused passwords, biggest group first, ignoring trashed copies", () => {
    expect(report.reusedGroups.map((g) => g.map((e) => e.id))).toEqual([
      ["b", "c", "d"],
      ["g", "h"],
    ]);
    expect(hasIssue(report, "f", "reused")).toBe(false);
  });

  it("flags passwords not changed in a year", () => {
    expect(report.old.map((e) => e.id)).toEqual(["e"]);
    expect(report.issues.get("e")).toEqual(["old"]);
  });

  it("an entry can have several issues", () => {
    const both = computeHealth(
      [
        entry("1", login("One", "weak-same"), { createdAt: TWO_YEARS_AGO }),
        entry("2", login("Two", "weak-same")),
      ],
      fakeScore,
      NOW,
    );
    expect(both.issues.get("1")).toEqual(["weak", "old", "reused"]);
    expect(both.issues.get("2")).toEqual(["weak", "reused"]);
  });
});

describe("passwordSetAt", () => {
  it("uses the newest password-history change, else creation", () => {
    const fresh = entry("1", login("A", "p"), { createdAt: TWO_YEARS_AGO });
    expect(passwordSetAt(fresh).toISOString()).toBe(new Date(TWO_YEARS_AGO).toISOString());

    const changed = entry(
      "2",
      login("B", "p", {
        passwordHistory: [
          { password: "older", changedAt: RECENT },
          { password: "oldest", changedAt: TWO_YEARS_AGO },
        ],
      }),
      { createdAt: TWO_YEARS_AGO },
    );
    expect(passwordSetAt(changed).toISOString()).toBe(new Date(RECENT).toISOString());
    expect(computeHealth([changed], fakeScore, NOW).old).toEqual([]);
  });
});

describe("userInputs", () => {
  it("gives name, username and site hosts to the scorer", () => {
    const e = entry(
      "1",
      login("GitHub", "p", {
        login: {
          username: "octo",
          password: "p",
          uris: [{ uri: "https://www.github.com/login" }, { uri: "not a url" }],
        },
      }),
    );
    expect(userInputs(e)).toEqual(["GitHub", "octo", "github.com", "not a url"]);
  });
});

describe("createScoreCache", () => {
  it("scores each item revision once and forgets everything on clear", () => {
    const score = vi.fn(() => 3);
    const cache = createScoreCache(score);
    const v1 = entry("1", login("A", "pw"));
    cache.scorer(v1);
    cache.scorer(v1);
    expect(score).toHaveBeenCalledOnce();
    expect(score).toHaveBeenCalledWith("pw", ["A", "me"]);

    cache.scorer({ ...v1, revision: 2 });
    expect(score).toHaveBeenCalledTimes(2);

    cache.clear();
    cache.scorer(v1);
    expect(score).toHaveBeenCalledTimes(3);
  });
});

describe("health filters", () => {
  it("round-trip through ?view=", () => {
    for (const issue of ["weak", "reused", "old"] as const) {
      const filter = parseFilter(issue);
      expect(filter).toEqual({ kind: "health", issue });
      expect(filterParam(filter)).toBe(issue);
    }
  });

  it("match flagged items, and nothing while the report is loading", () => {
    const items = [entry("a", login("Weak", "weak!")), entry("b", login("Ok", "Strong-Unique"))];
    const report = computeHealth(items, fakeScore, NOW);
    const weak = { kind: "health", issue: "weak" } as const;
    expect(filterItems(items, weak, "", report).map((e) => e.id)).toEqual(["a"]);
    expect(filterItems(items, weak, "", null)).toEqual([]);
  });
});
