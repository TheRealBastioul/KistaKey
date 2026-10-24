-- Initial migration: partitioned, append-only audit log.
--
-- Hand-written because Prisma can't express partitioning. The table and
-- index definitions match what Prisma generates for the AuditLog model, so
-- `prisma migrate dev` sees no drift. Everything Prisma doesn't model
-- (partitions, functions, trigger) lives in the `audit_partitions` schema,
-- which Prisma never inspects, so it never tries to drop it.

-- CreateTable
CREATE TABLE "audit_log" (
    "id" UUID NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "org_id" UUID,
    "actor_user_id" UUID,
    "actor_device_id" UUID,
    "action" TEXT NOT NULL,
    "target_type" TEXT,
    "target_id" TEXT,
    "request_id" TEXT,
    "ip_address" INET,
    "user_agent" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id","occurred_at")
) PARTITION BY RANGE ("occurred_at");

-- CreateIndex
CREATE INDEX "audit_log_org_id_occurred_at_idx" ON "audit_log"("org_id", "occurred_at");

-- CreateIndex
CREATE INDEX "audit_log_actor_user_id_occurred_at_idx" ON "audit_log"("actor_user_id", "occurred_at");

-- CreateIndex
CREATE INDEX "audit_log_target_type_target_id_idx" ON "audit_log"("target_type", "target_id");

-- Partition maintenance ---------------------------------------------------

CREATE SCHEMA IF NOT EXISTS "audit_partitions";

-- Creates the partition for the UTC month containing `month_start`
-- (idempotent). Partition names: audit_partitions.audit_log_YYYY_MM.
CREATE OR REPLACE FUNCTION "audit_partitions"."ensure_month"(month_start TIMESTAMP)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
    start_utc TIMESTAMP := date_trunc('month', month_start);
    from_ts TIMESTAMPTZ := start_utc AT TIME ZONE 'UTC';
    to_ts TIMESTAMPTZ := (start_utc + INTERVAL '1 month') AT TIME ZONE 'UTC';
    partition_name TEXT := 'audit_log_' || to_char(start_utc, 'YYYY_MM');
BEGIN
    EXECUTE format(
        'CREATE TABLE IF NOT EXISTS "audit_partitions".%I PARTITION OF public."audit_log" FOR VALUES FROM (%L) TO (%L)',
        partition_name, from_ts, to_ts
    );
END;
$$;

-- Ensures partitions exist for the current UTC month and the next
-- `months_ahead` months. Called by this migration and daily by the worker
-- (audit.ensure-partitions job).
CREATE OR REPLACE FUNCTION "audit_partitions"."ensure_ahead"(months_ahead INTEGER DEFAULT 3)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
    FOR i IN 0..months_ahead LOOP
        PERFORM "audit_partitions"."ensure_month"(
            date_trunc('month', now() AT TIME ZONE 'UTC') + make_interval(months => i)
        );
    END LOOP;
END;
$$;

SELECT "audit_partitions"."ensure_ahead"(3);

-- Append-only ---------------------------------------------------------------

-- Rejects every UPDATE and DELETE. Retention (later) drops whole
-- partitions (DETACH + DROP), which row triggers don't fire on.
CREATE OR REPLACE FUNCTION "audit_partitions"."reject_mutation"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'audit_log is append-only (% blocked)', TG_OP
        USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER "audit_log_append_only"
    BEFORE UPDATE OR DELETE ON "audit_log"
    FOR EACH ROW EXECUTE FUNCTION "audit_partitions"."reject_mutation"();
