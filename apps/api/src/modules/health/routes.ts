import type { HealthReadyResponse, HealthResponse } from "@repo/types";
import type { FastifyPluginAsync } from "fastify";

/** Named dependency checks, e.g. { database: () => ping, redis: () => ping }. */
export type HealthChecks = Record<string, () => Promise<unknown>>;

const CHECK_TIMEOUT_MS = 2_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
    promise.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

export function healthRoutes(checks: HealthChecks): FastifyPluginAsync {
  return async (app) => {
    // Liveness: the process is up. Load balancers restart on failure, so
    // this must not depend on Postgres/Redis.
    app.get(
      "/health",
      { config: { auth: "public" } },
      async (): Promise<HealthResponse> => ({ status: "ok" }),
    );

    // Readiness: dependencies answer. Load balancers stop routing on 503.
    app.get(
      "/health/ready",
      { config: { auth: "public" } },
      async (req, reply): Promise<HealthReadyResponse> => {
        const results = await Promise.all(
          Object.entries(checks).map(async ([name, check]) => {
            try {
              await withTimeout(check(), CHECK_TIMEOUT_MS);
              return [name, "ok"] as const;
            } catch (err) {
              req.log.warn({ err, check: name }, "readiness check failed");
              return [name, "fail"] as const;
            }
          }),
        );
        const healthy = results.every(([, status]) => status === "ok");
        reply.status(healthy ? 200 : 503);
        return { status: healthy ? "ok" : "degraded", checks: Object.fromEntries(results) };
      },
    );
  };
}
