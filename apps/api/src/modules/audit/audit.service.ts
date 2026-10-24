import { AuditActionSchema } from "@repo/types";
import type { Tenant } from "../../db/tenant";
import type { AuditRepository } from "./audit.repository";

export interface RecordAuditEvent {
  action: string;
  orgId?: string | null;
  actor?: { userId?: string; deviceId?: string };
  target?: { type: string; id: string };
  request?: { id?: string; ip?: string; userAgent?: string };
  /** Context only. Never secrets, ciphertext or field values: labels/ids are fine. */
  metadata?: Record<string, unknown>;
}

const MAX_PAGE = 200;

export function createAuditService(repo: AuditRepository) {
  return {
    /**
     * Writes one audit entry. Unlike notifications, this is NOT
     * fire-and-forget: callers await it, and if the audit write fails the
     * action fails, so nothing security-relevant happens unlogged.
     */
    async record(event: RecordAuditEvent): Promise<void> {
      await repo.insert({
        action: AuditActionSchema.parse(event.action),
        orgId: event.orgId ?? null,
        actorUserId: event.actor?.userId ?? null,
        actorDeviceId: event.actor?.deviceId ?? null,
        targetType: event.target?.type ?? null,
        targetId: event.target?.id ?? null,
        requestId: event.request?.id ?? null,
        ipAddress: event.request?.ip ?? null,
        userAgent: event.request?.userAgent ?? null,
        metadata: event.metadata ?? {},
      });
    },

    /** Newest first. Page with `before` = the last entry's occurredAt. */
    list(tenant: Tenant, opts: { limit?: number; before?: Date } = {}) {
      const limit = Math.min(Math.max(opts.limit ?? 50, 1), MAX_PAGE);
      return repo.listForTenant(tenant, { limit, ...(opts.before ? { before: opts.before } : {}) });
    },

    ensurePartitions(monthsAhead = 3): Promise<void> {
      return repo.ensurePartitions(monthsAhead);
    },
  };
}

export type AuditService = ReturnType<typeof createAuditService>;
