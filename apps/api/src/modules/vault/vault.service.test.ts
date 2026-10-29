import { describe, expect, it } from "vitest";
import { syncSince } from "./vault.service";

describe("syncSince", () => {
  const state = { revision: 40, tombstoneFloor: 10 };

  it("no since → whole vault", () => {
    expect(syncSince(undefined, state)).toBeNull();
  });

  it("older than the pruned tombstones → whole vault", () => {
    expect(syncSince(9, state)).toBeNull();
  });

  it("from the future → whole vault", () => {
    expect(syncSince(41, state)).toBeNull();
  });

  it("otherwise changes after since", () => {
    expect(syncSince(10, state)).toBe(10);
    expect(syncSince(40, state)).toBe(40);
    expect(syncSince(0, { revision: 0, tombstoneFloor: 0 })).toBe(0);
  });
});
