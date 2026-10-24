import { z } from "zod";

/**
 * Audit action names are `<domain>.<verb>[.<detail>]`, lowercase, e.g.
 * `auth.login`, `item.fill`, `gated.totp_issued`. Validated on write so the
 * log stays greppable as it grows.
 */
export const AuditActionSchema = z
  .string()
  .max(100)
  .regex(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/, "expected <domain>.<verb>");
export type AuditAction = z.infer<typeof AuditActionSchema>;

/** One audit entry as returned by the API. */
export const AuditEntrySchema = z.object({
  id: z.uuid(),
  occurredAt: z.iso.datetime(),
  orgId: z.uuid().nullable(),
  actorUserId: z.uuid().nullable(),
  actorDeviceId: z.uuid().nullable(),
  action: AuditActionSchema,
  targetType: z.string().nullable(),
  targetId: z.string().nullable(),
  requestId: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()),
});
export type AuditEntry = z.infer<typeof AuditEntrySchema>;
