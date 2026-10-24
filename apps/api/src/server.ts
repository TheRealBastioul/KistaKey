// API process entry point: wires real config + connections into buildApp.
import { buildApp } from "./app";
import { env } from "./config/env";
import { db, disconnectDb } from "./db/client";
import { createLogger } from "./lib/logger";
import { createRedis } from "./lib/redis";
import { onShutdown } from "./lib/shutdown";

const logger = createLogger({
  name: "api",
  level: env.LOG_LEVEL,
  pretty: env.NODE_ENV === "development",
});
const redis = createRedis(env.REDIS_URL);

const app = await buildApp({
  logger,
  trustProxyHops: env.TRUST_PROXY_HOPS,
  healthChecks: {
    database: () => db.writer.$queryRaw`SELECT 1`,
    redis: () => redis.ping(),
  },
});

onShutdown(logger, async () => {
  await app.close();
  redis.disconnect();
  await disconnectDb();
});

await app.listen({ host: env.HOST, port: env.PORT });
