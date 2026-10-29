// Worker process entry point: runs background jobs (BullMQ). Deployed as
// its own process type so job load never slows API requests. Same code
// base and modules as the API.
import { type Job, Worker } from "bullmq";
import { env } from "./config/env";
import { createSecurityConfig } from "./config/security";
import { db, disconnectDb } from "./db/client";
import { createQueue, QUEUES } from "./jobs/queues";
import { createJobScheduleAndHandlers } from "./jobs/schedule";
import { createLogger } from "./lib/logger";
import { createRedis, queueConnection } from "./lib/redis";
import { onShutdown } from "./lib/shutdown";
import { createModules } from "./modules";
import { createQueueEmailSender, createSmtpDelivery } from "./modules/email";

const log = createLogger({
  name: "worker",
  level: env.LOG_LEVEL,
  pretty: env.NODE_ENV === "development",
});
const connection = queueConnection(env.REDIS_URL);
const redis = createRedis(env.REDIS_URL);
const maintenance = createQueue(QUEUES.maintenance, connection);
const emailQueue = createQueue(QUEUES.email, connection);

const modules = createModules({
  db,
  redis,
  config: createSecurityConfig({
    appOrigin: env.APP_ORIGIN,
    encryptionKey: env.SERVER_ENCRYPTION_KEY,
    hmacKey: env.SERVER_HMAC_KEY,
  }),
  email: createQueueEmailSender(emailQueue),
  logger: log,
});

const { handlers, schedules } = createJobScheduleAndHandlers({
  audit: modules.audit,
  auth: modules.auth,
  vault: modules.vault,
  deliverEmail: createSmtpDelivery({
    host: env.MAIL_HOST,
    port: env.MAIL_PORT,
    secure: env.MAIL_SECURE,
    ...(env.MAIL_USER ? { user: env.MAIL_USER } : {}),
    ...(env.MAIL_PASSWORD ? { password: env.MAIL_PASSWORD } : {}),
    from: env.MAIL_FROM,
  }),
});

const queues = { [QUEUES.maintenance]: maintenance, [QUEUES.email]: emailQueue };
for (const s of schedules) {
  await queues[s.queue].upsertJobScheduler(s.id, { pattern: s.cron, tz: "UTC" }, { name: s.job });
}

// Don't wait for the first scheduled run after a fresh deploy.
await modules.audit.ensurePartitions();

const runJob = async (job: Job) => {
  const handler = handlers[job.name];
  if (!handler) throw new Error(`No handler for job "${job.name}"`);
  return handler(job);
};

const workers = [
  new Worker(QUEUES.maintenance, runJob, { connection, concurrency: 5 }),
  new Worker(QUEUES.email, runJob, { connection, concurrency: 10 }),
];

for (const worker of workers) {
  // Job data can hold email addresses and link tokens: log names and ids only.
  worker.on("completed", (job) => log.info({ job: job.name, id: job.id }, "job completed"));
  worker.on("failed", (job, err) => log.error({ job: job?.name, id: job?.id, err }, "job failed"));
}

onShutdown(log, async () => {
  await Promise.all(workers.map((w) => w.close()));
  await maintenance.close();
  await emailQueue.close();
  redis.disconnect();
  await disconnectDb();
});

log.info({ queues: Object.keys(queues) }, "worker started");
