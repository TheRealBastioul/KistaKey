// Which secret fields of the open item are shown in clear. Everything hides
// again REVEAL_MS after the last reveal and when the window loses focus or
// the tab is hidden. The detail pane is keyed by item id, so opening another
// item starts hidden too. Decisions §17.
import { useCallback, useEffect, useState } from "react";

export const REVEAL_MS = 30_000;

export interface Reveal {
  isRevealed(field: string): boolean;
  toggle(field: string): void;
}

export function useReveal(): Reveal {
  const [shown, setShown] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    if (shown.size === 0) return;
    const hide = () => setShown(new Set());
    const onVisibility = () => {
      if (document.hidden) hide();
    };
    const timer = setTimeout(hide, REVEAL_MS);
    window.addEventListener("blur", hide);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("blur", hide);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [shown]);

  const toggle = useCallback((field: string) => {
    setShown((prev) => {
      const next = new Set(prev);
      if (!next.delete(field)) next.add(field);
      return next;
    });
  }, []);

  return { isRevealed: (field) => shown.has(field), toggle };
}
