// Devices (decisions §11.14): a web browser is identified by a long-lived
// httpOnly device cookie, hashed per user. Trust (skip the MFA prompt) and
// revocation live on the device row; revoking a device kills its sessions.
import type { Device, SessionInfo } from "@repo/types";
import { DEVICE_TRUST_MS } from "../../config/security";
import type { UserTenant } from "../../db/tenant";
import { type Actor, auditActor } from "../../lib/actor";
import { notFound } from "../../lib/errors";
import { describeUserAgent, type RequestMeta } from "../../lib/http";
import { randomToken, sha256Hex } from "../../lib/secrets";
import type { AuditService } from "../audit";
import type { SessionsService } from "../sessions";
import type { DevicesRepository } from "./devices.repository";

export function createDevicesService(
  repo: DevicesRepository,
  sessions: SessionsService,
  audit: AuditService,
) {
  return {
    /**
     * The device for a login from this browser. Reuses the device cookie if
     * it maps to a live device of this user; otherwise registers a new device
     * (with a fresh cookie token, so a revoked device never comes back).
     */
    async resolveForLogin(input: {
      tenant: UserTenant;
      userId: string;
      deviceToken: string | undefined;
      userAgent: string | undefined;
    }) {
      // A browser keeps one device cookie across accounts. Mint a new one only
      // when it has none, or when it belongs to a revoked device of this user.
      let deviceToken = randomToken();
      if (input.deviceToken) {
        const existing = await repo.findByTokenHash(input.tenant, sha256Hex(input.deviceToken));
        if (existing && !existing.revokedAt) {
          await repo.touch(input.tenant, existing.id, new Date());
          return { device: existing, deviceToken: input.deviceToken, isNew: false, isFirst: false };
        }
        if (!existing) deviceToken = input.deviceToken;
      }
      const isFirst = !(await repo.hasAny(input.tenant));
      const device = await repo.create({
        userId: input.userId,
        kind: "web",
        name: describeUserAgent(input.userAgent),
        tokenHash: sha256Hex(deviceToken),
      });
      return { device, deviceToken, isNew: true, isFirst };
    },

    isTrusted(device: { trustedUntil: Date | null }, now = new Date()): boolean {
      return device.trustedUntil !== null && device.trustedUntil > now;
    },

    async trust(actor: Actor, request: RequestMeta): Promise<void> {
      const until = new Date(Date.now() + DEVICE_TRUST_MS);
      await repo.setTrustedUntil(actor.tenant, actor.deviceId, until);
      await audit.record({
        action: "device.trusted",
        actor: auditActor(actor),
        target: { type: "device", id: actor.deviceId },
        request,
        metadata: { trustedUntil: until.toISOString() },
      });
    },

    /** Account recovery: no browser keeps skipping MFA (decisions §14.1). Returns devices changed. */
    untrustAll(tenant: UserTenant): Promise<number> {
      return repo.clearAllTrust(tenant);
    },

    async list(tenant: UserTenant, currentDeviceId: string): Promise<Device[]> {
      const rows = await repo.listActive(tenant);
      return rows.map((d) => ({
        id: d.id,
        kind: d.kind,
        name: d.name,
        trustedUntil: d.trustedUntil?.toISOString() ?? null,
        firstSeenAt: d.firstSeenAt.toISOString(),
        lastSeenAt: d.lastSeenAt.toISOString(),
        current: d.id === currentDeviceId,
      }));
    },

    /** Revokes a device: its trust and every session on it. */
    async revoke(actor: Actor, deviceId: string, request: RequestMeta): Promise<void> {
      const count = await repo.revoke(actor.tenant, deviceId, new Date());
      if (count === 0) throw notFound("Device not found");
      const sessionsRevoked = await sessions.revokeForDevice(actor.tenant, deviceId);
      await audit.record({
        action: "device.revoked",
        actor: auditActor(actor),
        target: { type: "device", id: deviceId },
        request,
        metadata: { sessionsRevoked, self: deviceId === actor.deviceId },
      });
    },

    listSessions(actor: Actor): Promise<SessionInfo[]> {
      return sessions.list(actor.tenant, actor.sessionId);
    },

    async revokeSession(actor: Actor, sessionId: string, request: RequestMeta): Promise<void> {
      if (!(await sessions.revoke(actor.tenant, sessionId))) throw notFound("Session not found");
      await audit.record({
        action: "session.revoked",
        actor: auditActor(actor),
        target: { type: "session", id: sessionId },
        request,
        metadata: { self: sessionId === actor.sessionId },
      });
    },
  };
}

export type DevicesService = ReturnType<typeof createDevicesService>;
