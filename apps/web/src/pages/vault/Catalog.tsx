// Middle pane: search box + "New" menu + the items in the current filter,
// sorted by name.
import { ITEM_TYPES, type ItemType } from "@repo/types";
import { useCallback, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { useDismiss } from "../../lib/useDismiss";
import type { HealthIssue } from "../../vault/health";
import { filterItems } from "../../vault/search";
import type { VaultEntry } from "../../vault/store";
import { useHealth } from "../../vault/useHealth";
import { useVault } from "../../vault/useVault";
import { useVaultParams } from "./useVaultParams";

const TYPE_BADGE = { login: "L", note: "N", totp: "2FA" } as const;

function subtitle(entry: VaultEntry): string {
  if (!entry.data) return "Couldn't decrypt";
  if (entry.type === "note") return "Secure note";
  return entry.data.login?.username || entry.data.login?.uris[0]?.uri || "";
}

const EMPTY_TEXT: Record<string, string> = {
  favorites: "No favorites yet.",
  trash: "The trash is empty. Items are deleted for good 30 days after they're trashed.",
};

const HEALTH_EMPTY_TEXT: Record<HealthIssue | "loading" | "error", string> = {
  weak: "No weak passwords.",
  reused: "No reused passwords.",
  old: "No passwords older than a year.",
  loading: "Checking your passwords…",
  error: "Couldn't load the password checker. Reload the page to try again.",
};

const NEW_LABELS: Record<ItemType, string> = {
  login: "Login",
  note: "Secure note",
  totp: "Authenticator code",
};

/** "New" button with a menu of item types. */
function NewMenu() {
  const { newHref } = useVaultParams();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-fg hover:opacity-90"
      >
        New
      </button>
      {open && (
        <ul
          aria-label="New item type"
          className="absolute right-0 z-20 mt-1 w-48 rounded-md border border-line bg-surface py-1 shadow-lg"
        >
          {ITEM_TYPES.map((type) => (
            <li key={type}>
              <Link
                to={newHref(type)}
                onClick={() => setOpen(false)}
                className="block px-3 py-1.5 text-sm hover:bg-bg"
              >
                {NEW_LABELS[type]}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Catalog() {
  const vault = useVault();
  const { itemId } = useParams();
  const { filter, query, setQuery, itemHref } = useVaultParams();
  const health = useHealth();
  const visible = useMemo(
    () => filterItems(vault.items, filter, query, health.report),
    [vault.items, filter, query, health.report],
  );
  const emptyText =
    filter.kind === "health"
      ? HEALTH_EMPTY_TEXT[health.status === "ready" ? filter.issue : health.status]
      : (EMPTY_TEXT[filter.kind] ?? "No items here.");

  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-lg border border-line bg-surface">
      <div className="flex gap-2 border-b border-line p-2">
        <input
          type="search"
          aria-label="Search the vault"
          placeholder="Search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="min-w-0 flex-1 rounded-md border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <NewMenu />
      </div>
      {visible.length === 0 ? (
        <p className="p-4 text-sm text-muted">
          {query ? "Nothing matches your search." : emptyText}
        </p>
      ) : (
        <ul className="min-h-0 flex-1 divide-y divide-line overflow-y-auto" aria-label="Items">
          {visible.map((entry) => {
            const active = entry.id === itemId;
            return (
              <li key={entry.id}>
                <Link
                  to={itemHref(entry.id)}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-3 px-3 py-2 ${active ? "bg-bg" : "hover:bg-bg"}`}
                >
                  <span
                    aria-hidden
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-line text-[10px] font-semibold text-muted"
                  >
                    {TYPE_BADGE[entry.type]}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-sm ${entry.data ? "" : "text-bad"}`}>
                      {entry.name}
                      {entry.data?.favorite && (
                        <span className="ml-1 text-accent" title="Favorite">
                          ★
                        </span>
                      )}
                    </span>
                    <span className="block truncate text-xs text-muted">{subtitle(entry)}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <p className="border-t border-line px-3 py-1.5 text-xs text-muted" aria-live="polite">
        {visible.length} {visible.length === 1 ? "item" : "items"}
        {vault.syncing && " · syncing…"}
      </p>
    </div>
  );
}
