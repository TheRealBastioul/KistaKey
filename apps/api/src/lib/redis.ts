import { Redis, type RedisOptions } from "ioredis";

/**
 * ioredis options from a redis:// or rediss:// URL. Used for the API's own
 * client and (with maxRetriesPerRequest: null) for BullMQ connections, so
 * both read the same REDIS_URL.
 */
export function redisOptionsFromUrl(url: string): RedisOptions {
  const u = new URL(url);
  if (u.protocol !== "redis:" && u.protocol !== "rediss:") {
    throw new Error(`REDIS_URL must use redis:// or rediss://, got ${u.protocol}`);
  }
  const options: RedisOptions = {
    host: u.hostname,
    port: u.port ? Number(u.port) : 6379,
    db: u.pathname.length > 1 ? Number(u.pathname.slice(1)) : 0,
  };
  if (u.username) options.username = decodeURIComponent(u.username);
  if (u.password) options.password = decodeURIComponent(u.password);
  if (u.protocol === "rediss:") options.tls = {};
  return options;
}

export function createRedis(url: string): Redis {
  return new Redis(redisOptionsFromUrl(url));
}

/** BullMQ requires maxRetriesPerRequest: null on worker connections. */
export function queueConnection(url: string): RedisOptions {
  return { ...redisOptionsFromUrl(url), maxRetriesPerRequest: null };
}
