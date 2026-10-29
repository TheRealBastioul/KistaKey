// The health report for the vault pages. Loads the zxcvbn scorer on first
// use; scores are cached per item revision and dropped when the vault locks.
import { useEffect, useMemo, useState } from "react";
import { computeHealth, createScoreCache, type HealthReport } from "./health";
import { loadPasswordScorer } from "./strength";
import { useVault, vaultStore } from "./useVault";

let cache: ReturnType<typeof createScoreCache> | null = null;

vaultStore.subscribe(() => {
  if (vaultStore.getSnapshot().status === "idle") cache?.clear();
});

export type HealthState =
  | { status: "loading"; report: null }
  | { status: "error"; report: null }
  | { status: "ready"; report: HealthReport };

export function useHealth(): HealthState {
  const vault = useVault();
  const [status, setStatus] = useState<"loading" | "error" | "ready">(cache ? "ready" : "loading");

  useEffect(() => {
    if (cache) return;
    let mounted = true;
    loadPasswordScorer().then(
      (score) => {
        cache ??= createScoreCache(score);
        if (mounted) setStatus("ready");
      },
      () => {
        if (mounted) setStatus("error");
      },
    );
    return () => {
      mounted = false;
    };
  }, []);

  return useMemo((): HealthState => {
    if (status !== "ready" || !cache) {
      return { status: status === "error" ? "error" : "loading", report: null };
    }
    return { status, report: computeHealth(vault.items, cache.scorer) };
  }, [status, vault.items]);
}
