// Worker process entry point: runs background jobs (BullMQ). Deployed as
// its own process type so job load never slows API requests. Same code
// base and modules as the API.
import { type Job, Worker } from "bullmq";
import { env } from "./config/env";
import { db, disconnectDb } from "./db/client";
import { createQueue, QUEUES } from "./jobs/queues";
import { createJobScheduleAndHandlers } from "./jobs/schedule";
import { createLogger } from "./lib/logger";
import { queueConnection } from "./lib/redis";
import { onShutdown } from "./lib/shutdown";
import { createAuditModule } from "./modules/audit";

const log = createLogger({
  name: "worker",
  level: env.LOG_LEVEL,
  pretty: env.NODE_ENV === "development",
});
const connection = queueConnection(env.REDIS_URL);
const audit = createAuditModule(db);

const { handlers, schedules } = createJobScheduleAndHandlers({ audit });

const maintenance = createQueue(QUEUES.maintenance, connection);
for (const s of schedules) {
  await maintenance.upsertJobScheduler(s.id, { pattern: s.cron, tz: "UTC" }, { name: s.job });
}

// Don't wait for the first scheduled run after a fresh deploy.
await audit.ensurePartitions();

const worker = new Worker(
  QUEUES.maintenance,
  async (job: Job) => {
    const handler = handlers[job.name];
    if (!handler) throw new Error(`No handler for job "${job.name}"`);
    return handler(job);
  },
  { connection, concurrency: 5 },
);

worker.on("completed", (job) => log.info({ job: job.name, id: job.id }, "job completed"));
worker.on("failed", (job, err) => log.error({ job: job?.name, id: job?.id, err }, "job failed"));

onShutdown(log, async () => {
  await worker.close();
  await maintenance.close();
  await disconnectDb();
});

log.info({ queues: [QUEUES.maintenance] }, "worker started");
