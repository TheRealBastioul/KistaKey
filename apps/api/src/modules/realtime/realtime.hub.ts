// Cross-instance change notifications (decisions §19). Whoever commits a
// vault write (any API instance, or the worker) publishes `vault:<userId>`
// with only the new revision; each API instance subscribes to the channels
// of users that have an open stream on it, on one dedicated subscriber
// connection opened on first use (the worker never opens it).
import type { Redis } from "ioredis";

/** What a stream sends: never item data, the client calls /vault/sync. */
export interface VaultEvent {
  revision: number;
}

type Listener = (event: VaultEvent) => void;

interface Channel {
  listeners: Set<Listener>;
  /** Resolves once Redis has acknowledged the SUBSCRIBE. */
  ready: Promise<void>;
}

export interface RealtimeHubDeps {
  publisher: Redis;
  /** Opens the dedicated subscriber connection (a connection in subscribe mode can't run other commands). */
  createSubscriber: () => Redis;
  onError: (err: unknown, msg: string) => void;
}

export const vaultChannel = (userId: string) => `vault:${userId}`;

export function parseVaultEvent(message: string): VaultEvent | null {
  try {
    const parsed = JSON.parse(message) as { revision?: unknown };
    const revision = parsed?.revision;
    return typeof revision === "number" && Number.isSafeInteger(revision) && revision >= 0
      ? { revision }
      : null;
  } catch {
    return null;
  }
}

export function createRealtimeHub({ publisher, createSubscriber, onError }: RealtimeHubDeps) {
  const channels = new Map<string, Channel>();
  let subscriber: Redis | null = null;

  function getSubscriber(): Redis {
    if (subscriber) return subscriber;
    const sub = createSubscriber();
    sub.on("error", (err) => onError(err, "realtime subscriber error"));
    sub.on("message", (channel: string, message: string) => {
      const entry = channels.get(channel);
      if (!entry) return;
      const event = parseVaultEvent(message);
      if (!event) return;
      for (const listener of entry.listeners) listener(event);
    });
    subscriber = sub;
    return sub;
  }

  return {
    /**
     * After commit only. Best effort: a lost event is covered by the
     * client's polling fallback, so a Redis failure never fails the write.
     */
    vaultChanged(userId: string, revision: number): void {
      const event: VaultEvent = { revision };
      publisher
        .publish(vaultChannel(userId), JSON.stringify(event))
        .catch((err: unknown) => onError(err, "realtime publish failed"));
    },

    /**
     * Calls `listener` for every change to this user's vault. Resolves once
     * events can arrive; returns the unsubscribe function.
     */
    async subscribeVault(userId: string, listener: Listener): Promise<() => void> {
      const name = vaultChannel(userId);
      let entry = channels.get(name);
      if (!entry) {
        const sub = getSubscriber();
        const created: Channel = {
          listeners: new Set(),
          ready: sub.subscribe(name).then(() => undefined),
        };
        // A failed SUBSCRIBE must not stick: the next stream retries it.
        created.ready.catch(() => {
          if (channels.get(name) === created) channels.delete(name);
        });
        channels.set(name, created);
        entry = created;
      }
      entry.listeners.add(listener);
      const current = entry;

      const unsubscribe = () => {
        if (!current.listeners.delete(listener)) return;
        if (current.listeners.size > 0 || channels.get(name) !== current) return;
        channels.delete(name);
        subscriber
          ?.unsubscribe(name)
          .catch((err: unknown) => onError(err, "realtime unsubscribe failed"));
      };

      try {
        await current.ready;
      } catch (err) {
        unsubscribe();
        throw err;
      }
      return unsubscribe;
    },

    /** Number of users with at least one stream on this instance (tests, metrics). */
    channelCount(): number {
      return channels.size;
    },

    close(): void {
      channels.clear();
      subscriber?.disconnect();
      subscriber = null;
    },
  };
}

export type RealtimeHub = ReturnType<typeof createRealtimeHub>;
