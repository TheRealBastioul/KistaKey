// Opaque session tokens (decisions §11.7). Postgres holds the truth
// (SHA-256 of the token); Redis caches each live session keyed by that hash,
// carries the exact idle deadline, and holds a revocation marker so a
// revoked session is rejected on the very next request, even if a
// concurrent request was re-caching it.
import type { SessionInfo } from "@repo/types";
import type { Redis } from "ioredis";
import { SESSION_ABSOLUTE_MS, SESSION_IDLE_MS } from "../../config/security";
import type { UserTenant } from "../../db/tenant";
import type { RequestMeta } from "../../lib/http";
import { randomToken, sha256Hex } from "../../lib/secrets";
import type { SessionsRepository } from "./sessions.repository";

/** A validated session, as the auth hook sees it. */
export interface SessionContext {
  id: string;
  userId: string;
  deviceId: string;
  mfaVerified: boolean;
  securityStamp: string;
  /** SHA-256 of the cookie token (the Redis cache key); never the token itself. */
  tokenHash: string;
}

interface CachedSession {
  id: string;
  userId: string;
  deviceId: string;
  mfaVerifiedAt: number | null;
  securityStamp: string;
  idleExpiresAt: number;
  absoluteExpiresAt: number;
  /** When last_seen_at was last written to Postgres. */
  dbSeenAt: number;
}

/** Postgres last_seen_at / idle_expires_at are written at most this often per session. */
const DB_TOUCH_INTERVAL_MS = 60_000;

const cacheKey = (tokenHash: string) => `sess:${tokenHash}`;
const revokedKey = (tokenHash: string) => `sess:revoked:${tokenHash}`;

export function createSessionsService(repo: SessionsRepository, redis: Redis) {
  async function dropFromCache(tokenHashes: string[]): Promise<void> {
    if (tokenHashes.length === 0) return;
    const pipeline = redis.pipeline();
    for (const hash of tokenHashes) {
      pipeline.set(revokedKey(hash), "1", "PX", SESSION_ABSOLUTE_MS);
      pipeline.del(cacheKey(hash));
    }
    await pipeline.exec();
  }

  async function writeCache(tokenHash: string, entry: CachedSession, now: number): Promise<void> {
    await redis.set(
      cacheKey(tokenHash),
      JSON.stringify(entry),
      "PX",
      Math.max(1, entry.idleExpiresAt - now),
    );
  }

  return {
    async create(input: {
      userId: string;
      deviceId: string;
      securityStamp: string;
      mfaVerified: boolean;
      request: RequestMeta;
    }): Promise<{ token: string; session: SessionContext }> {
      const token = randomToken();
      const tokenHash = sha256Hex(token);
      const now = Date.now();
      const row = await repo.create({
        userId: input.userId,
        deviceId: input.deviceId,
        tokenHash,
        securityStamp: input.securityStamp,
        mfaVerifiedAt: input.mfaVerified ? new Date(now) : null,
        idleExpiresAt: new Date(now + SESSION_IDLE_MS),
        absoluteExpiresAt: new Date(now + SESSION_ABSOLUTE_MS),
        ipAddress: input.request.ip,
        userAgent: input.request.userAgent ?? null,
      });
      return {
        token,
        session: {
          id: row.id,
          userId: row.userId,
          deviceId: row.deviceId,
          mfaVerified: input.mfaVerified,
          securityStamp: row.securityStamp,
          tokenHash,
        },
      };
    },

    /**
     * Cookie token -> live session, sliding the idle deadline. Null for
     * unknown, revoked, idle-expired or absolute-expired sessions.
     */
    async validate(token: string): Promise<SessionContext | null> {
      const tokenHash = sha256Hex(token);
      const now = Date.now();
      const [cached, revoked] = await redis.mget(cacheKey(tokenHash), revokedKey(tokenHash));
      if (revoked) return null;

      let entry: CachedSession;
      if (cached) {
        entry = JSON.parse(cached) as CachedSession;
      } else {
        const row = await repo.findLiveByTokenHash(tokenHash, new Date(now));
        if (!row) return null;
        entry = {
          id: row.id,
          userId: row.userId,
          deviceId: row.deviceId,
          mfaVerifiedAt: row.mfaVerifiedAt?.getTime() ?? null,
          securityStamp: row.securityStamp,
          idleExpiresAt: row.idleExpiresAt.getTime(),
          absoluteExpiresAt: row.absoluteExpiresAt.getTime(),
          dbSeenAt: row.lastSeenAt.getTime(),
        };
      }

      if (now >= entry.idleExpiresAt || now >= entry.absoluteExpiresAt) {
        await redis.del(cacheKey(tokenHash));
        return null;
      }

      entry.idleExpiresAt = Math.min(now + SESSION_IDLE_MS, entry.absoluteExpiresAt);
      if (now - entry.dbSeenAt >= DB_TOUCH_INTERVAL_MS) {
        await repo.touch(entry.id, new Date(now), new Date(entry.idleExpiresAt));
        entry.dbSeenAt = now;
      }
      await writeCache(tokenHash, entry, now);

      return {
        id: entry.id,
        userId: entry.userId,
        deviceId: entry.deviceId,
        mfaVerified: entry.mfaVerifiedAt !== null,
        securityStamp: entry.securityStamp,
        tokenHash,
      };
    },

    /** Second factor passed (or setup completed) for this session. */
    async markMfaVerified(tenant: UserTenant, session: SessionContext): Promise<void> {
      await repo.markMfaVerified(tenant, session.id, new Date());
      await redis.del(cacheKey(session.tokenHash));
    },

    /** Keeps the current session alive across a security-stamp change (password change). */
    async setSecurityStamp(
      tenant: UserTenant,
      session: SessionContext,
      securityStamp: string,
    ): Promise<void> {
      await repo.setSecurityStamp(tenant, session.id, securityStamp);
      await redis.del(cacheKey(session.tokenHash));
    },

    /** Returns false if there was no such live session for this user. */
    async revoke(tenant: UserTenant, sessionId: string): Promise<boolean> {
      const hashes = await repo.revoke(tenant, sessionId, new Date());
      await dropFromCache(hashes);
      return hashes.length > 0;
    },

    async revokeAll(tenant: UserTenant, opts: { exceptSessionId?: string } = {}): Promise<number> {
      const hashes = await repo.revokeAll(tenant, new Date(), opts.exceptSessionId);
      await dropFromCache(hashes);
      return hashes.length;
    },

    async revokeForDevice(tenant: UserTenant, deviceId: string): Promise<number> {
      const hashes = await repo.revokeForDevice(tenant, deviceId, new Date());
      await dropFromCache(hashes);
      return hashes.length;
    },

    async list(tenant: UserTenant, currentSessionId: string): Promise<SessionInfo[]> {
      const rows = await repo.listLive(tenant, new Date());
      return rows.map((r) => ({
        id: r.id,
        deviceId: r.deviceId,
        deviceName: r.device.name,
        ipAddress: r.ipAddress,
        userAgent: r.userAgent,
        createdAt: r.createdAt.toISOString(),
        lastSeenAt: r.lastSeenAt.toISOString(),
        current: r.id === currentSessionId,
      }));
    },

    /** Maintenance job: delete rows dead for more than a day. */
    cleanup(): Promise<number> {
      return repo.deleteDead(new Date(Date.now() - 24 * 60 * 60 * 1000));
    },
  };
}

export type SessionsService = ReturnType<typeof createSessionsService>;
