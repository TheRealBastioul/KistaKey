// Loads data from an API call on mount; `reload` refetches (after a change).
// Keeps the last data while reloading, so lists don't flash empty. Pass a
// stable function (e.g. `mfaApi.overview`), or it reloads on every render.
import { useCallback, useEffect, useState } from "react";
import { errorMessage } from "../api/client";

export interface Loaded<T> {
  data: T | null;
  error: string | null;
  reload(): Promise<void>;
}

export function useLoad<T>(load: () => Promise<T>): Loaded<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setData(await load());
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [load]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, error, reload };
}
