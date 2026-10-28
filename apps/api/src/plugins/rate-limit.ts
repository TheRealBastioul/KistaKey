// Rate limits (decisions §11.12) on @fastify/rate-limit with its Redis
// store, so limits hold across API instances. The plugin runs only one of
// its own hooks per request, so routes needing several keys (IP *and*
// email) use rateLimits(), which checks each with app.createRateLimit.
import { fastifyRateLimit } from "@fastify/rate-limit";
import type { FastifyInstance, FastifyRequest, preHandlerAsyncHookHandler } from "fastify";
import type { Redis } from "ioredis";
import { AppError } from "../lib/errors";

export async function registerRateLimit(app: FastifyInstance, redis: Redis): Promise<void> {
  await app.register(fastifyRateLimit, {
    global: false,
    redis,
    nameSpace: "rl:",
  });
}

export interface LimitRule {
  /** Distinguishes counters, e.g. "login-ip". */
  name: string;
  max: number;
  windowMs: number;
  /** The key to count by; null skips the rule for this request. */
  key: (req: FastifyRequest) => string | null;
}

export const byIp = (req: FastifyRequest): string => req.ip;

/** Normalized body.email (runs before validation, so it's defensive). */
export const byEmail = (req: FastifyRequest): string | null => {
  const email = (req.body as { email?: unknown } | undefined)?.email;
  return typeof email === "string" ? email.trim().toLowerCase().slice(0, 254) : null;
};

export const byUser = (req: FastifyRequest): string | null => req.auth?.user.id ?? null;

/** A preHandler that enforces every rule; the first exceeded one answers 429. */
export function rateLimits(app: FastifyInstance, rules: LimitRule[]): preHandlerAsyncHookHandler {
  const checks = rules.map((rule) => ({
    rule,
    check: app.createRateLimit({
      max: rule.max,
      timeWindow: rule.windowMs,
      keyGenerator: (req) => `${rule.name}:${rule.key(req) ?? ""}`,
    }),
  }));
  return async (req) => {
    for (const { rule, check } of checks) {
      if (rule.key(req) === null) continue;
      const result = await check(req);
      if (!result.isAllowed && result.isExceeded) {
        throw new AppError(
          429,
          "RATE_LIMITED",
          `Too many attempts. Try again in ${Math.max(1, result.ttlInSeconds)} seconds.`,
        );
      }
    }
  };
}
