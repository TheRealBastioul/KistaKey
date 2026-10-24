import type { Job } from "bullmq";
import type { AuditService } from "../modules/audit";
import { JOBS } from "./queues";

export type JobHandler = (job: Job) => Promise<unknown>;

export interface JobSchedule {
  /** Stable scheduler id: upserting the same id never duplicates the schedule. */
  id: string;
  /** Cron pattern, UTC. */
  cron: string;
  job: string;
}

/**
 * Job name -> handler, plus the repeating schedules. Handlers call module
 * services only, like routes do. Add one row per new job.
 */
export function createJobScheduleAndHandlers(deps: { audit: AuditService }) {
  const handlers: Record<string, JobHandler> = {
    [JOBS.ensureAuditPartitions]: () => deps.audit.ensurePartitions(),
  };

  const schedules: JobSchedule[] = [
    { id: "audit-partitions-daily", cron: "0 3 * * *", job: JOBS.ensureAuditPartitions },
  ];

  return { handlers, schedules };
}
