// API process entry point: wires real config + connections into buildApp.
import { buildApp } from "./app";
import { env } from "./config/env";
import { LEGAL_DOCUMENTS } from "./config/legal";
import { createSecurityConfig } from "./config/security";
import { db, disconnectDb } from "./db/client";
import { createQueue, QUEUES } from "./jobs/queues";
import { createLogger } from "./lib/logger";
import { createRedis, queueConnection } from "./lib/redis";
import { onShutdown } from "./lib/shutdown";
import { createModules } from "./modules";
import { createQueueEmailSender } from "./modules/email";

const logger = createLogger({
  name: "api",
  level: env.LOG_LEVEL,
  pretty: env.NODE_ENV === "development",
});
const redis = createRedis(env.REDIS_URL);
const emailQueue = createQueue(QUEUES.email, queueConnection(env.REDIS_URL));

const modules = createModules({
  db,
  redis,
  config: createSecurityConfig({
    appOrigin: env.APP_ORIGIN,
    encryptionKey: env.SERVER_ENCRYPTION_KEY,
    hmacKey: env.SERVER_HMAC_KEY,
  }),
  email: createQueueEmailSender(emailQueue),
});

// Published Terms/Privacy versions; refuses to start if one was edited.
await modules.legal.seed(LEGAL_DOCUMENTS);

const app = await buildApp({
  logger,
  trustProxyHops: env.TRUST_PROXY_HOPS,
  healthChecks: {
    database: () => db.writer.$queryRaw`SELECT 1`,
    redis: () => redis.ping(),
  },
  modules,
});

onShutdown(logger, async () => {
  await app.close();
  await emailQueue.close();
  redis.disconnect();
  await disconnectDb();
});

await app.listen({ host: env.HOST, port: env.PORT });
