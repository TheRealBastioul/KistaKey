import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BACKOFF_MAX_MS,
  BACKOFF_MIN_MS,
  backoffMs,
  createLiveSync,
  type EventSourceLike,
  POLL_MS,
  parseRevision,
} from "./live";

class FakeSource implements EventSourceLike {
  closed = false;
  private readonly listeners = new Map<string, ((event: { data?: unknown }) => void)[]>();
  addEventListener(type: string, listener: (event: { data?: unknown }) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  close() {
    this.closed = true;
  }
  emit(type: string, data?: string) {
    for (const listener of this.listeners.get(type) ?? []) listener({ data });
  }
}

function setup(revision: number | null = 5) {
  const sources: FakeSource[] = [];
  const sync = vi.fn(async () => {});
  let have = revision;
  const live = createLiveSync({
    open: () => {
      const source = new FakeSource();
      sources.push(source);
      return source;
    },
    sync,
    revision: () => have,
    timers: {
      setTimeout: (fn, ms) => setTimeout(fn, ms),
      clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
      setInterval: (fn, ms) => setInterval(fn, ms),
      clearInterval: (h) => clearInterval(h as ReturnType<typeof setInterval>),
    },
    random: () => 0.5, // no jitter
  });
  const last = () => sources[sources.length - 1] as FakeSource;
  return { live, sources, last, sync, setRevision: (r: number) => (have = r) };
}

describe("parseRevision", () => {
  it("reads only an integer revision", () => {
    expect(parseRevision('{"revision":3}')).toBe(3);
    expect(parseRevision('{"revision":"3"}')).toBeNull();
    expect(parseRevision("nope")).toBeNull();
    expect(parseRevision(undefined)).toBeNull();
  });
});

describe("backoffMs", () => {
  it("doubles from the minimum up to the cap, with ±25 % jitter", () => {
    const mid = () => 0.5;
    expect(backoffMs(0, mid)).toBe(BACKOFF_MIN_MS);
    expect(backoffMs(1, mid)).toBe(BACKOFF_MIN_MS * 2);
    expect(backoffMs(30, mid)).toBe(BACKOFF_MAX_MS);
    expect(backoffMs(0, () => 0)).toBe(BACKOFF_MIN_MS * 0.75);
    expect(backoffMs(0, () => 0.999999)).toBeLessThanOrEqual(BACKOFF_MIN_MS * 1.25);
  });
});

describe("live sync", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("goes live on ready and syncs to catch up", () => {
    const { live, last, sync } = setup();
    live.start();
    expect(live.status()).toBe("connecting");
    last().emit("ready", "{}");
    expect(live.status()).toBe("live");
    expect(sync).toHaveBeenCalledOnce();
  });

  it("syncs only for a revision newer than the store's", () => {
    const { live, last, sync } = setup(5);
    live.start();
    last().emit("ready", "{}");
    sync.mockClear();
    last().emit("vault", '{"revision":5}');
    expect(sync).not.toHaveBeenCalled();
    last().emit("vault", '{"revision":6}');
    expect(sync).toHaveBeenCalledOnce();
    // Malformed: sync anyway rather than miss a change.
    last().emit("vault", "junk");
    expect(sync).toHaveBeenCalledTimes(2);
  });

  it("on error: closes, polls every minute, reconnects with backoff and resyncs", () => {
    const { live, sources, last, sync } = setup();
    live.start();
    last().emit("ready", "{}");
    sync.mockClear();

    const first = last();
    first.emit("error");
    expect(first.closed).toBe(true);
    expect(live.status()).toBe("offline");
    expect(sync).toHaveBeenCalledOnce(); // immediate catch-up (and 401 detection)

    vi.advanceTimersByTime(BACKOFF_MIN_MS);
    expect(sources).toHaveLength(2);
    expect(live.status()).toBe("offline");
    // Still failing: the next attempt waits twice as long.
    last().emit("error");
    vi.advanceTimersByTime(BACKOFF_MIN_MS * 2 - 1);
    expect(sources).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(sources).toHaveLength(3);

    sync.mockClear();
    vi.advanceTimersByTime(POLL_MS - BACKOFF_MIN_MS * 3);
    expect(sync).toHaveBeenCalledOnce(); // the 60 s poll

    last().emit("ready", "{}");
    expect(live.status()).toBe("live");
    sync.mockClear();
    vi.advanceTimersByTime(POLL_MS * 3);
    expect(sync).not.toHaveBeenCalled(); // polling stopped once live
  });

  it("ignores events from a source it has replaced", () => {
    const { live, sources, sync } = setup();
    live.start();
    const first = sources[0] as FakeSource;
    first.emit("error");
    vi.advanceTimersByTime(BACKOFF_MIN_MS);
    sync.mockClear();
    first.emit("vault", '{"revision":99}');
    first.emit("ready", "{}");
    expect(sync).not.toHaveBeenCalled();
    expect(live.status()).toBe("offline");
  });

  it("stop closes the stream and cancels reconnect and polling", () => {
    const { live, sources, last, sync } = setup();
    live.start();
    last().emit("error");
    live.stop();
    expect(live.status()).toBe("off");
    sync.mockClear();
    vi.advanceTimersByTime(POLL_MS * 2);
    expect(sources).toHaveLength(1);
    expect(sync).not.toHaveBeenCalled();

    live.start();
    expect(sources).toHaveLength(2);
    live.stop();
    expect(last().closed).toBe(true);
  });

  it("notifies subscribers on status changes", () => {
    const { live, last } = setup();
    const listener = vi.fn();
    live.subscribe(listener);
    live.start();
    last().emit("ready", "{}");
    last().emit("ready", "{}"); // no change, no call
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
