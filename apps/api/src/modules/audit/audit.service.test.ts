import { describe, expect, it, vi } from "vitest";
import { userTenant } from "../../db/tenant";
import type { AuditRepository } from "./audit.repository";
import { createAuditService } from "./audit.service";

function fakeRepo() {
  return {
    insert: vi.fn().mockResolvedValue(undefined),
    listForTenant: vi.fn().mockResolvedValue([]),
    ensurePartitions: vi.fn().mockResolvedValue(undefined),
  };
}

describe("audit service", () => {
  it("maps an event to a row, defaulting absent fields to null", async () => {
    const repo = fakeRepo();
    const audit = createAuditService(repo as unknown as AuditRepository);

    await audit.record({ action: "auth.login", actor: { userId: "u1" }, request: { id: "r1" } });

    expect(repo.insert).toHaveBeenCalledWith({
      action: "auth.login",
      orgId: null,
      actorUserId: "u1",
      actorDeviceId: null,
      targetType: null,
      targetId: null,
      requestId: "r1",
      ipAddress: null,
      userAgent: null,
      metadata: {},
    });
  });

  it("rejects malformed action names before writing", async () => {
    const repo = fakeRepo();
    const audit = createAuditService(repo as unknown as AuditRepository);

    await expect(audit.record({ action: "Login" })).rejects.toThrow();
    expect(repo.insert).not.toHaveBeenCalled();
  });

  it("clamps the page size", async () => {
    const repo = fakeRepo();
    const audit = createAuditService(repo as unknown as AuditRepository);

    await audit.list(userTenant("u1"), { limit: 10_000 });

    expect(repo.listForTenant).toHaveBeenCalledWith(userTenant("u1"), { limit: 200 });
  });
});
