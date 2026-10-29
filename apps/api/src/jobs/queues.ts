import { Queue, type QueueOptions } from "bullmq";

// One queue per workload type, so a flood of one kind (e.g. emails) can't
// delay another (e.g. grant expiry). Add queues here as phases need them.
export const QUEUES = {
  maintenance: "maintenance",
  email: "email",
} as const;
export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

export const JOBS = {
  ensureAuditPartitions: "audit.ensure-partitions",
  authCleanup: "auth.cleanup",
  sendEmail: "email.send",
  purgeTrash: "vault.purge-trash",
} as const;

const DEFAULT_JOB_OPTIONS: QueueOptions["defaultJobOptions"] = {
  attempts: 3,
  backoff: { type: "exponential", delay: 5_000 },
  removeOnComplete: 1_000,
  removeOnFail: 5_000,
};

export function createQueue(name: QueueName, connection: QueueOptions["connection"]): Queue {
  return new Queue(name, { connection, defaultJobOptions: DEFAULT_JOB_OPTIONS });
}
