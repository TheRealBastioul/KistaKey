// The decrypted user key, in memory only (never Web Storage). Locks itself
// after `idleMs` without a touch(); lock() zeroes the bytes. Timers are
// injectable so the idle logic is testable with fake timers.
import { AUTO_LOCK_MS } from "../config";

export interface KeyStore {
  /** Stores a new key (wiping any previous one) and starts the idle timer. */
  set(key: Uint8Array): void;
  get(): Uint8Array | null;
  isUnlocked(): boolean;
  /** Activity: pushes the auto-lock deadline back. No-op while locked. */
  touch(): void;
  /** Wipes the key. Safe to call when already locked. */
  lock(): void;
  /** Called after every set and lock. Returns an unsubscribe function. */
  subscribe(listener: () => void): () => void;
}

export interface KeyStoreOptions {
  idleMs: number;
  timers?: {
    setTimeout: (fn: () => void, ms: number) => unknown;
    clearTimeout: (handle: unknown) => void;
  };
}

const defaultTimers = {
  setTimeout: (fn: () => void, ms: number): unknown => globalThis.setTimeout(fn, ms),
  clearTimeout: (handle: unknown) =>
    globalThis.clearTimeout(handle as ReturnType<typeof globalThis.setTimeout>),
};

export function createKeyStore({ idleMs, timers = defaultTimers }: KeyStoreOptions): KeyStore {
  let key: Uint8Array | null = null;
  let timer: unknown;
  const listeners = new Set<() => void>();

  const notify = () => {
    for (const listener of listeners) listener();
  };

  const disarm = () => {
    if (timer !== undefined) timers.clearTimeout(timer);
    timer = undefined;
  };

  const arm = () => {
    disarm();
    timer = timers.setTimeout(() => store.lock(), idleMs);
  };

  const store: KeyStore = {
    set(next) {
      if (key && key !== next) key.fill(0);
      key = next;
      arm();
      notify();
    },
    get: () => key,
    isUnlocked: () => key !== null,
    touch() {
      if (key) arm();
    },
    lock() {
      disarm();
      if (!key) return;
      key.fill(0);
      key = null;
      notify();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return store;
}

/** The app's key store. */
export const keyStore = createKeyStore({ idleMs: AUTO_LOCK_MS });
