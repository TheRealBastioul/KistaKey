// Live vault updates (decisions §19). An EventSource on /vault/events says
// "the vault is now at revision N"; the store then syncs. On `ready` (first
// connect and every reconnect) it syncs too, to catch what it missed. When
// the stream fails it's closed and reopened with backoff, and the vault is
// polled every 60 s until it's back. Events never carry item data.
//
// The event source and timers are injected so the logic is unit-tested.

export type LiveStatus = "off" | "connecting" | "live" | "offline";

/** The bits of EventSource this uses. */
export interface EventSourceLike {
  addEventListener(type: string, listener: (event: { data?: unknown }) => void): void;
  close(): void;
}

export interface LiveSyncDeps {
  open(): EventSourceLike;
  /** The store's sync (never rejects). */
  sync(): Promise<void>;
  /** The revision the store has, or null before the first sync. */
  revision(): number | null;
  timers?: {
    setTimeout: (fn: () => void, ms: number) => unknown;
    clearTimeout: (handle: unknown) => void;
    setInterval: (fn: () => void, ms: number) => unknown;
    clearInterval: (handle: unknown) => void;
  };
  /** 0 ≤ random() < 1, for backoff jitter. */
  random?: () => number;
}

export interface LiveSync {
  start(): void;
  stop(): void;
  status(): LiveStatus;
  subscribe(listener: () => void): () => void;
}

export const POLL_MS = 60_000;
export const BACKOFF_MIN_MS = 1_000;
export const BACKOFF_MAX_MS = 60_000;

const defaultTimers = {
  setTimeout: (fn: () => void, ms: number): unknown => globalThis.setTimeout(fn, ms),
  clearTimeout: (handle: unknown) =>
    globalThis.clearTimeout(handle as ReturnType<typeof globalThis.setTimeout>),
  setInterval: (fn: () => void, ms: number): unknown => globalThis.setInterval(fn, ms),
  clearInterval: (handle: unknown) =>
    globalThis.clearInterval(handle as ReturnType<typeof globalThis.setInterval>),
};

/** `{"revision":N}` → N, anything else → null. */
export function parseRevision(data: unknown): number | null {
  if (typeof data !== "string") return null;
  try {
    const revision = (JSON.parse(data) as { revision?: unknown })?.revision;
    return typeof revision === "number" && Number.isSafeInteger(revision) ? revision : null;
  } catch {
    return null;
  }
}

/** Delay before reconnect attempt `attempt` (0-based): doubling, capped, ±25 % jitter. */
export function backoffMs(attempt: number, random: () => number): number {
  const base = Math.min(BACKOFF_MAX_MS, BACKOFF_MIN_MS * 2 ** Math.min(attempt, 16));
  return Math.round(base * (0.75 + random() * 0.5));
}

export function createLiveSync({
  open,
  sync,
  revision,
  timers = defaultTimers,
  random = Math.random,
}: LiveSyncDeps): LiveSync {
  let current: LiveStatus = "off";
  let source: EventSourceLike | null = null;
  let reconnect: unknown;
  let poll: unknown;
  let attempt = 0;
  const listeners = new Set<() => void>();

  const setStatus = (next: LiveStatus) => {
    if (next === current) return;
    current = next;
    for (const listener of listeners) listener();
  };

  const stopPolling = () => {
    if (poll !== undefined) timers.clearInterval(poll);
    poll = undefined;
  };
  const startPolling = () => {
    if (poll === undefined) poll = timers.setInterval(() => void sync(), POLL_MS);
  };

  function connect() {
    reconnect = undefined;
    const es = open();
    source = es;
    setStatus(current === "offline" ? "offline" : "connecting");

    es.addEventListener("ready", () => {
      if (source !== es) return;
      attempt = 0;
      stopPolling();
      setStatus("live");
      void sync();
    });
    es.addEventListener("vault", (event) => {
      if (source !== es) return;
      const next = parseRevision(event.data);
      const have = revision();
      if (next === null || have === null || next > have) void sync();
    });
    // Network error, server restart, stream lifetime over, or a 401. Close it
    // (so the browser doesn't retry on its own schedule) and retry with backoff.
    // The sync also surfaces a 401, which signs the app out.
    es.addEventListener("error", () => {
      if (source !== es) return;
      es.close();
      source = null;
      setStatus("offline");
      startPolling();
      void sync();
      reconnect = timers.setTimeout(connect, backoffMs(attempt++, random));
    });
  }

  return {
    start() {
      if (current !== "off") return;
      attempt = 0;
      connect();
    },
    stop() {
      if (reconnect !== undefined) timers.clearTimeout(reconnect);
      reconnect = undefined;
      stopPolling();
      source?.close();
      source = null;
      setStatus("off");
    },
    status: () => current,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
