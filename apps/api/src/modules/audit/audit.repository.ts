import type { Tenant } from "../../db/tenant";
import type { DbHandles } from "../../db/types";
import type { Prisma } from "../../generated/prisma/client";

export interface AuditInsert {
  orgId: string | null;
  actorUserId: string | null;
  actorDeviceId: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  requestId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown>;
}

/**
 * audit_log has no user_id column: personal-scope rows are the ones with
 * no org, attributed to the acting user.
 */
function auditTenantWhere(tenant: Tenant): Prisma.AuditLogWhereInput {
  return tenant.kind === "org"
    ? { orgId: tenant.orgId }
    : { orgId: null, actorUserId: tenant.userId };
}

export function createAuditRepository({ writer, reader }: DbHandles) {
  return {
    insert(row: AuditInsert) {
      return writer.auditLog.create({
        data: { ...row, metadata: row.metadata as Prisma.InputJsonObject },
      });
    },

    listForTenant(tenant: Tenant, opts: { limit: number; before?: Date }) {
      return reader.auditLog.findMany({
        where: {
          ...auditTenantWhere(tenant),
          ...(opts.before ? { occurredAt: { lt: opts.before } } : {}),
        },
        orderBy: { occurredAt: "desc" },
        take: opts.limit,
      });
    },

    /** Creates monthly partitions ahead of time (SQL function in the init migration). */
    async ensurePartitions(monthsAhead: number): Promise<void> {
      await writer.$executeRaw`SELECT "audit_partitions"."ensure_ahead"(${monthsAhead}::int)`;
    },
  };
}

export type AuditRepository = ReturnType<typeof createAuditRepository>;
