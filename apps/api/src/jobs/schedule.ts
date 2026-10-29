import type { Job } from "bullmq";
import type { AuditService } from "../modules/audit";
import type { AuthService } from "../modules/auth";
import type { EmailMessage } from "../modules/email";
import type { VaultService } from "../modules/vault";
import { JOBS, QUEUES, type QueueName } from "./queues";

export type JobHandler = (job: Job) => Promise<unknown>;

export interface JobSchedule {
  /** Stable scheduler id: upserting the same id never duplicates the schedule. */
  id: string;
  /** Cron pattern, UTC. */
  cron: string;
  job: string;
  queue: QueueName;
}

/**
 * Job name -> handler, plus the repeating schedules. Handlers call module
 * services only, like routes do. Add one row per new job.
 */
export function createJobScheduleAndHandlers(deps: {
  audit: AuditService;
  auth: AuthService;
  vault: VaultService;
  deliverEmail: (message: EmailMessage) => Promise<void>;
}) {
  const handlers: Record<string, JobHandler> = {
    [JOBS.ensureAuditPartitions]: () => deps.audit.ensurePartitions(),
    [JOBS.authCleanup]: () => deps.auth.cleanup(),
    [JOBS.purgeTrash]: () => deps.vault.purgeExpired(),
    [JOBS.sendEmail]: (job) => deps.deliverEmail(job.data as EmailMessage),
  };

  const schedules: JobSchedule[] = [
    {
      id: "audit-partitions-daily",
      cron: "0 3 * * *",
      job: JOBS.ensureAuditPartitions,
      queue: QUEUES.maintenance,
    },
    {
      id: "auth-cleanup-daily",
      cron: "30 3 * * *",
      job: JOBS.authCleanup,
      queue: QUEUES.maintenance,
    },
    {
      id: "vault-purge-trash-daily",
      cron: "0 4 * * *",
      job: JOBS.purgeTrash,
      queue: QUEUES.maintenance,
    },
  ];

  return { handlers, schedules };
}
