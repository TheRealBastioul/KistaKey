// Values copied on the generator page, newest first, in memory only. Wiped
// when the key store locks (Lock now, auto-lock, sign out).
import { keyStore } from "../../auth/keyStore";

export const GENERATOR_HISTORY_LIMIT = 20;

export interface HistoryEntry {
  id: number;
  value: string;
  at: Date;
}

let entries: HistoryEntry[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

const notify = () => {
  for (const listener of listeners) listener();
};

export const generatorHistory = {
  list: () => entries,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  /** Copying the same value again moves it to the top. */
  add(value: string) {
    entries = [
      { id: nextId++, value, at: new Date() },
      ...entries.filter((e) => e.value !== value),
    ].slice(0, GENERATOR_HISTORY_LIMIT);
    notify();
  },
  clear() {
    if (entries.length === 0) return;
    entries = [];
    notify();
  },
};

keyStore.subscribe(() => {
  if (!keyStore.isUnlocked()) generatorHistory.clear();
});
