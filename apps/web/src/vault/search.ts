// Catalog filters and client-side search (the server can't search: names,
// usernames and URIs are encrypted). Each entry's search text is built once
// when it's decrypted; a query matches when every word appears in it.
// Passwords, TOTP secrets and hidden custom fields are never indexed.
import type { ItemData, ItemType } from "@repo/types";
import { HEALTH_ISSUES, type HealthIssue, type HealthReport, hasIssue } from "./health";
import type { VaultEntry } from "./store";

export type VaultFilter =
  | { kind: "all" }
  | { kind: "favorites" }
  | { kind: "type"; type: ItemType }
  | { kind: "folder"; folderId: string | null }
  | { kind: "health"; issue: HealthIssue }
  | { kind: "trash" };

const TYPES = new Set<string>(["login", "note", "totp"]);
const ISSUES = new Set<string>(HEALTH_ISSUES);

/** Lowercase, accents removed, so "Café" matches "cafe". */
export function normalize(text: string): string {
  return text.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
}

export function searchText(data: ItemData | null): string {
  if (!data) return "";
  const parts = [
    data.name,
    data.login?.username ?? "",
    ...(data.login?.uris ?? []).map((u) => u.uri),
  ];
  if (data.note) parts.push(data.note);
  for (const field of data.customFields) {
    parts.push(field.label);
    if (!field.hidden) parts.push(field.value);
  }
  return normalize(parts.filter(Boolean).join("\n"));
}

/**
 * `?view=` value ↔ filter: "favorites", "trash", "login", "folder:<id>",
 * "folder:none", "weak" / "reused" / "old" (password health).
 */
export function parseFilter(value: string | null): VaultFilter {
  if (value === "favorites" || value === "trash") return { kind: value };
  if (value && TYPES.has(value)) return { kind: "type", type: value as ItemType };
  if (value && ISSUES.has(value)) return { kind: "health", issue: value as HealthIssue };
  if (value?.startsWith("folder:")) {
    const id = value.slice("folder:".length);
    return { kind: "folder", folderId: id === "none" ? null : id };
  }
  return { kind: "all" };
}

export function filterParam(filter: VaultFilter): string | null {
  switch (filter.kind) {
    case "all":
      return null;
    case "type":
      return filter.type;
    case "folder":
      return `folder:${filter.folderId ?? "none"}`;
    case "health":
      return filter.issue;
    default:
      return filter.kind;
  }
}

/** `health` is needed only for health filters (null while it's computed: nothing matches). */
export function inFilter(
  entry: VaultEntry,
  filter: VaultFilter,
  health: HealthReport | null = null,
): boolean {
  if (filter.kind === "trash") return entry.deletedAt !== null;
  if (entry.deletedAt !== null) return false;
  switch (filter.kind) {
    case "all":
      return true;
    case "favorites":
      return entry.data?.favorite === true;
    case "type":
      return entry.type === filter.type;
    case "folder":
      return entry.folderId === filter.folderId;
    case "health":
      return health !== null && hasIssue(health, entry.id, filter.issue);
  }
}

/** Entries in the filter whose search text contains every word of the query (order kept). */
export function filterItems(
  items: VaultEntry[],
  filter: VaultFilter,
  query: string,
  health: HealthReport | null = null,
): VaultEntry[] {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  return items.filter(
    (entry) =>
      inFilter(entry, filter, health) && words.every((word) => entry.search.includes(word)),
  );
}

/** Sidebar counts. Trashed items count only toward `trash`. */
export function countItems(items: VaultEntry[]) {
  const counts = {
    all: 0,
    favorites: 0,
    trash: 0,
    type: { login: 0, note: 0, totp: 0 } as Record<ItemType, number>,
    folder: new Map<string | null, number>(),
  };
  for (const entry of items) {
    if (entry.deletedAt !== null) {
      counts.trash++;
      continue;
    }
    counts.all++;
    if (entry.data?.favorite) counts.favorites++;
    counts.type[entry.type]++;
    counts.folder.set(entry.folderId, (counts.folder.get(entry.folderId) ?? 0) + 1);
  }
  return counts;
}
