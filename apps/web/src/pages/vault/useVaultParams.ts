// The vault's URL state: `?view=` (filter) and `?q=` (search). Links to an
// item keep both, so the catalog stays as it was. `?type=` belongs to
// /vault/new only and isn't carried along.
import type { ItemType } from "@repo/types";
import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router";
import { filterParam, parseFilter, type VaultFilter } from "../../vault/search";

export function useVaultParams() {
  const [params, setParams] = useSearchParams();
  const view = params.get("view");
  const filter = useMemo(() => parseFilter(view), [view]);
  const query = params.get("q") ?? "";
  const kept = new URLSearchParams(params);
  kept.delete("type");
  const search = kept.toString() ? `?${kept.toString()}` : "";
  const join = (extra: string) => (search ? `${search}&${extra}` : `?${extra}`);

  // Typing replaces the history entry instead of adding one per key.
  const setQuery = useCallback(
    (value: string) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (value) next.set("q", value);
          else next.delete("q");
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );

  return {
    filter,
    query,
    /** Href for an item, keeping the filter and query. */
    itemHref: (id: string) => `/vault/${id}${search}`,
    editHref: (id: string) => `/vault/${id}/edit${search}`,
    newHref: (type: ItemType) => `/vault/new${join(`type=${type}`)}`,
    /** The dashboard (no item open), keeping the filter and query. */
    homeHref: `/vault${search}`,
    /** Href that switches the filter (closes the open item). */
    filterHref(next: VaultFilter) {
      const p = new URLSearchParams(kept);
      const value = filterParam(next);
      if (value) p.set("view", value);
      else p.delete("view");
      return p.toString() ? `/vault?${p.toString()}` : "/vault";
    },
    setQuery,
  };
}
