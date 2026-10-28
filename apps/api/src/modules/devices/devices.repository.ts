import type { DeviceKind } from "@repo/types";
import { tenantWhere, type UserTenant } from "../../db/tenant";
import type { DbHandles } from "../../db/types";

export function createDevicesRepository({ writer, reader }: DbHandles) {
  return {
    findByTokenHash(tenant: UserTenant, tokenHash: string) {
      return writer.device.findFirst({ where: { ...tenantWhere(tenant), tokenHash } });
    },

    async hasAny(tenant: UserTenant): Promise<boolean> {
      return (await writer.device.count({ where: tenantWhere(tenant), take: 1 })) > 0;
    },

    create(data: { userId: string; kind: DeviceKind; name: string; tokenHash: string }) {
      return writer.device.create({ data });
    },

    touch(tenant: UserTenant, id: string, at: Date) {
      return writer.device.updateMany({
        where: { ...tenantWhere(tenant), id },
        data: { lastSeenAt: at },
      });
    },

    setTrustedUntil(tenant: UserTenant, id: string, until: Date | null) {
      return writer.device.updateMany({
        where: { ...tenantWhere(tenant), id, revokedAt: null },
        data: { trustedUntil: until },
      });
    },

    listActive(tenant: UserTenant) {
      return reader.device.findMany({
        where: { ...tenantWhere(tenant), revokedAt: null },
        orderBy: { lastSeenAt: "desc" },
      });
    },

    /** Revokes the device and drops its trust. Returns how many rows changed (0 = not found). */
    async revoke(tenant: UserTenant, id: string, at: Date): Promise<number> {
      const { count } = await writer.device.updateMany({
        where: { ...tenantWhere(tenant), id, revokedAt: null },
        data: { revokedAt: at, trustedUntil: null },
      });
      return count;
    },
  };
}

export type DevicesRepository = ReturnType<typeof createDevicesRepository>;
