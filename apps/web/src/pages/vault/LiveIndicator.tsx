// Small status line for live updates: a dot and a word, with the detail in
// the tooltip. "Offline" still refreshes every minute (polling fallback).
import type { LiveStatus } from "../../vault/live";
import { useLiveStatus } from "../../vault/useVault";

const LABELS: Record<LiveStatus, { text: string; title: string; dot: string }> = {
  off: { text: "Not connected", title: "Live updates are off", dot: "bg-muted" },
  connecting: { text: "Connecting…", title: "Connecting for live updates", dot: "bg-muted" },
  live: { text: "Live", title: "Changes from other devices show up right away", dot: "bg-ok" },
  offline: {
    text: "Reconnecting…",
    title: "Live updates are down; checking for changes every minute",
    dot: "bg-bad",
  },
};

export function LiveIndicator() {
  const status = useLiveStatus();
  const label = LABELS[status];
  return (
    <p
      className="flex items-center gap-2 text-xs text-muted"
      title={label.title}
      aria-live="polite"
    >
      <span className={`inline-block size-2 rounded-full ${label.dot}`} aria-hidden="true" />
      {label.text}
    </p>
  );
}
