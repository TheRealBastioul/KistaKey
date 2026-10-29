import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createKeyStore } from "./keyStore";

const IDLE = 1000;

describe("keyStore", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("locks after the idle time", () => {
    const store = createKeyStore({ idleMs: IDLE });
    store.set(new Uint8Array([1, 2, 3]));
    vi.advanceTimersByTime(IDLE - 1);
    expect(store.isUnlocked()).toBe(true);
    vi.advanceTimersByTime(1);
    expect(store.isUnlocked()).toBe(false);
    expect(store.get()).toBeNull();
  });

  it("touch pushes the deadline back", () => {
    const store = createKeyStore({ idleMs: IDLE });
    store.set(new Uint8Array([1]));
    vi.advanceTimersByTime(IDLE - 100);
    store.touch();
    vi.advanceTimersByTime(IDLE - 100);
    expect(store.isUnlocked()).toBe(true);
    vi.advanceTimersByTime(100);
    expect(store.isUnlocked()).toBe(false);
  });

  it("touch while locked doesn't arm a timer", () => {
    const store = createKeyStore({ idleMs: IDLE });
    store.touch();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("lock wipes the key bytes", () => {
    const store = createKeyStore({ idleMs: IDLE });
    const key = new Uint8Array([9, 9, 9]);
    store.set(key);
    store.lock();
    expect(Array.from(key)).toEqual([0, 0, 0]);
    expect(store.get()).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("set wipes the previous key", () => {
    const store = createKeyStore({ idleMs: IDLE });
    const first = new Uint8Array([7, 7]);
    store.set(first);
    store.set(new Uint8Array([8, 8]));
    expect(Array.from(first)).toEqual([0, 0]);
    expect(Array.from(store.get() ?? [])).toEqual([8, 8]);
  });

  it("notifies subscribers on set and lock, until unsubscribed", () => {
    const store = createKeyStore({ idleMs: IDLE });
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.set(new Uint8Array([1]));
    vi.advanceTimersByTime(IDLE);
    expect(listener).toHaveBeenCalledTimes(2);
    store.lock(); // already locked: no extra notification
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    store.set(new Uint8Array([2]));
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
