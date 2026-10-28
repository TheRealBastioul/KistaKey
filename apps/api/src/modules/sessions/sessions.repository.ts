import { tenantWhere, type UserTenant } from "../../db/tenant";
import type { DbHandles } from "../../db/types";

export interface NewSession {
  userId: string;
  deviceId: string;
  tokenHash: string;
  securityStamp: string;
  mfaVerifiedAt: Date | null;
  idleExpiresAt: Date;
  absoluteExpiresAt: Date;
  ipAddress: string | null;
  userAgent: string | null;
}

const live = (now: Date) => ({
  revokedAt: null,
  idleExpiresAt: { gt: now },
  absoluteExpiresAt: { gt: now },
  device: { revokedAt: null },
});

export function createSessionsRepository({ writer, reader }: DbHandles) {
  /** Marks matching live sessions revoked; returns their token hashes (to drop from Redis). */
  async function revokeWhere(
    where: { userId: string; id?: string | { not: string }; deviceId?: string },
    at: Date,
  ): Promise<string[]> {
    const rows = await writer.session.findMany({
      where: { ...where, revokedAt: null },
      select: { tokenHash: true },
    });
    if (rows.length === 0) return [];
    await writer.session.updateMany({
      where: { ...where, revokedAt: null },
      data: { revokedAt: at },
    });
    return rows.map((r) => r.tokenHash);
  }

  return {
    create(data: NewSession) {
      return writer.session.create({ data });
    },

    /** Lookup by cookie hash (no tenant yet: this is how the tenant is found). */
    findLiveByTokenHash(tokenHash: string, now: Date) {
      return writer.session.findFirst({ where: { tokenHash, ...live(now) } });
    },

    touch(id: string, lastSeenAt: Date, idleExpiresAt: Date) {
      return writer.session.updateMany({
        where: { id, revokedAt: null },
        data: { lastSeenAt, idleExpiresAt },
      });
    },

    markMfaVerified(tenant: UserTenant, id: string, at: Date) {
      return writer.session.updateMany({
        where: { ...tenantWhere(tenant), id },
        data: { mfaVerifiedAt: at },
      });
    },

    setSecurityStamp(tenant: UserTenant, id: string, securityStamp: string) {
      return writer.session.updateMany({
        where: { ...tenantWhere(tenant), id },
        data: { securityStamp },
      });
    },

    revoke(tenant: UserTenant, id: string, at: Date) {
      return revokeWhere({ ...tenantWhere(tenant), id }, at);
    },

    revokeAll(tenant: UserTenant, at: Date, exceptId?: string) {
      return revokeWhere(
        { ...tenantWhere(tenant), ...(exceptId ? { id: { not: exceptId } } : {}) },
        at,
      );
    },

    revokeForDevice(tenant: UserTenant, deviceId: string, at: Date) {
      return revokeWhere({ ...tenantWhere(tenant), deviceId }, at);
    },

    listLive(tenant: UserTenant, now: Date) {
      return reader.session.findMany({
        where: { ...tenantWhere(tenant), ...live(now) },
        include: { device: { select: { name: true } } },
        orderBy: { lastSeenAt: "desc" },
      });
    },

    /** Maintenance: drop sessions that can never be used again. */
    async deleteDead(before: Date): Promise<number> {
      const { count } = await writer.session.deleteMany({
        where: {
          OR: [
            { absoluteExpiresAt: { lt: before } },
            { idleExpiresAt: { lt: before } },
            { revokedAt: { lt: before } },
          ],
        },
      });
      return count;
    },
  };
}

export type SessionsRepository = ReturnType<typeof createSessionsRepository>;
