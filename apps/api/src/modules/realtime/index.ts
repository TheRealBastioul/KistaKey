// Public API of the realtime module: the Redis pub/sub hub (publish after a
// vault write, subscribe per stream) and the /vault/events SSE route.
import type { Redis } from "ioredis";
import type { SessionsService } from "../sessions";
import type { UsersService } from "../users";
import { createRealtimeHub } from "./realtime.hub";

export type { RealtimeHub, VaultEvent } from "./realtime.hub";
export { realtimeRoutes } from "./realtime.routes";

export interface StreamSettings {
  heartbeatMs: number;
  /** Streams end after this long; the client reconnects through the full auth hook. */
  maxStreamMs: number;
  maxStreamsPerUser: number;
  /** EventSource reconnect delay the stream asks for. */
  retryMs: number;
}

export const DEFAULT_STREAM_SETTINGS: StreamSettings = {
  heartbeatMs: 25_000,
  maxStreamMs: 60 * 60_000,
  maxStreamsPerUser: 10,
  retryMs: 5_000,
};

export interface RealtimeDeps {
  redis: Redis;
  sessions: SessionsService;
  users: UsersService;
  onError: (err: unknown, msg: string) => void;
  settings?: Partial<StreamSettings>;
}

export function createRealtimeModule({ redis, sessions, users, onError, settings }: RealtimeDeps) {
  const hub = createRealtimeHub({
    publisher: redis,
    createSubscriber: () => redis.duplicate(),
    onError,
  });
  return {
    hub,
    settings: { ...DEFAULT_STREAM_SETTINGS, ...settings },
    /** Session not revoked or expired (without sliding it), user active, stamp unchanged. */
    async streamStillValid(userId: string, tokenHash: string): Promise<boolean> {
      const session = await sessions.peek(tokenHash);
      if (!session) return false;
      const user = await users.getState(userId);
      return (
        user !== null && user.status === "active" && user.securityStamp === session.securityStamp
      );
    },
    close(): void {
      hub.close();
    },
  };
}

export type RealtimeModule = ReturnType<typeof createRealtimeModule>;
