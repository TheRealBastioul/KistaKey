import { type ItemDataInput, ItemDataSchema, type ItemType } from "@repo/types";
import { describe, expect, it } from "vitest";
import {
  countItems,
  filterItems,
  filterParam,
  normalize,
  parseFilter,
  searchText,
  type VaultFilter,
} from "./search";
import type { VaultEntry } from "./store";

const T = "2026-10-28T12:00:00.000Z";

function entry(
  id: string,
  input: ItemDataInput,
  opts: { type?: ItemType; folderId?: string | null; trashed?: boolean } = {},
): VaultEntry {
  const data = ItemDataSchema.parse(input);
  return {
    id,
    type: opts.type ?? "login",
    folderId: opts.folderId ?? null,
    revision: 1,
    createdAt: T,
    updatedAt: T,
    deletedAt: opts.trashed ? T : null,
    data,
    name: data.name,
    search: searchText(data),
    encrypted: {} as VaultEntry["encrypted"],
  };
}

const items = [
  entry("1", {
    name: "GitHub",
    favorite: true,
    login: { username: "octo", password: "s3cret", uris: [{ uri: "https://github.com" }] },
  }),
  entry("2", { name: "Bank notes", note: "Branch: Zürich" }, { type: "note", folderId: "f1" }),
  entry(
    "3",
    {
      name: "Router",
      customFields: [
        { id: "00000000-0000-4000-8000-000000000001", label: "PIN", value: "4321", hidden: true },
        {
          id: "00000000-0000-4000-8000-000000000002",
          label: "Model",
          value: "AX55",
          hidden: false,
        },
      ],
    },
    { folderId: "f1" },
  ),
  entry("4", { name: "Old GitHub" }, { trashed: true }),
];

const ids = (list: VaultEntry[]) => list.map((e) => e.id);

describe("search", () => {
  it("normalizes case and accents", () => {
    expect(normalize("ZÜRICH Café")).toBe("zurich cafe");
  });

  it("matches every word, anywhere in the indexed text", () => {
    expect(ids(filterItems(items, { kind: "all" }, "git octo"))).toEqual(["1"]);
    expect(ids(filterItems(items, { kind: "all" }, "zurich"))).toEqual(["2"]);
    expect(ids(filterItems(items, { kind: "all" }, "ax55"))).toEqual(["3"]);
    expect(ids(filterItems(items, { kind: "all" }, "  "))).toEqual(["1", "2", "3"]);
  });

  it("never matches passwords or hidden field values", () => {
    expect(filterItems(items, { kind: "all" }, "s3cret")).toEqual([]);
    expect(filterItems(items, { kind: "all" }, "4321")).toEqual([]);
    expect(ids(filterItems(items, { kind: "all" }, "pin"))).toEqual(["3"]);
  });

  it("filters by favorites, type, folder and trash", () => {
    const run = (filter: VaultFilter) => ids(filterItems(items, filter, ""));
    expect(run({ kind: "favorites" })).toEqual(["1"]);
    expect(run({ kind: "type", type: "note" })).toEqual(["2"]);
    expect(run({ kind: "folder", folderId: "f1" })).toEqual(["2", "3"]);
    expect(run({ kind: "folder", folderId: null })).toEqual(["1"]);
    expect(run({ kind: "trash" })).toEqual(["4"]);
    expect(ids(filterItems(items, { kind: "trash" }, "github"))).toEqual(["4"]);
  });

  it("round-trips filters through the URL value", () => {
    const filters: VaultFilter[] = [
      { kind: "all" },
      { kind: "favorites" },
      { kind: "trash" },
      { kind: "type", type: "totp" },
      { kind: "folder", folderId: "f1" },
      { kind: "folder", folderId: null },
    ];
    for (const filter of filters) expect(parseFilter(filterParam(filter))).toEqual(filter);
    expect(parseFilter("nonsense")).toEqual({ kind: "all" });
  });

  it("counts items; trashed ones only toward trash", () => {
    const counts = countItems(items);
    expect(counts).toMatchObject({ all: 3, favorites: 1, trash: 1 });
    expect(counts.type).toEqual({ login: 2, note: 1, totp: 0 });
    expect(counts.folder.get("f1")).toBe(2);
    expect(counts.folder.get(null)).toBe(1);
  });
});
