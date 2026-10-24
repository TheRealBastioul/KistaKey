// Runs against a real Postgres (TEST_DATABASE_URL, migrated by
// test/setup/migrate-test-db.ts). Proves the hand-written init migration:
// partitions exist, inserts route into them, and the table is append-only.
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { orgTenant } from "../../src/db/tenant";
import { PrismaClient } from "../../src/generated/prisma/client";
import { type AuditService, createAuditModule } from "../../src/modules/audit";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("audit log (integration)", () => {
  let client: PrismaClient;
  let audit: AuditService;
  // Fresh org per run: the table is append-only, so old rows stay around.
  const orgId = randomUUID();

  beforeAll(() => {
    client = new PrismaClient({ adapter: new PrismaPg({ connectionString: url ?? "" }) });
    audit = createAuditModule({ writer: client, reader: client });
  });

  afterAll(async () => {
    await client?.$disconnect();
  });

  it("has partitions for this month and the next three", async () => {
    await audit.ensurePartitions(3);
    const rows = await client.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM pg_inherits
      WHERE inhparent = 'public.audit_log'::regclass`;
    expect(rows[0]?.n).toBeGreaterThanOrEqual(4);
  });

  it("ensurePartitions is idempotent", async () => {
    await expect(audit.ensurePartitions(3)).resolves.toBeUndefined();
  });

  it("records an entry and lists it for its org only", async () => {
    await audit.record({
      action: "test.recorded",
      orgId,
      actor: { userId: randomUUID() },
      metadata: { note: "integration" },
    });

    const mine = await audit.list(orgTenant(orgId));
    expect(mine).toHaveLength(1);
    expect(mine[0]?.action).toBe("test.recorded");

    const other = await audit.list(orgTenant(randomUUID()));
    expect(other).toHaveLength(0);
  });

  it("rejects UPDATE", async () => {
    await expect(
      client.auditLog.updateMany({ where: { orgId }, data: { action: "test.tampered" } }),
    ).rejects.toThrow(/append-only/);
  });

  it("rejects DELETE", async () => {
    await expect(client.auditLog.deleteMany({ where: { orgId } })).rejects.toThrow(/append-only/);
  });
});
