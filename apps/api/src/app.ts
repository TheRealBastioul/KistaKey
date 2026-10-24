// Builds the Fastify app from injected dependencies. No env, DB or Redis
// imports here, so tests can build the real app with fakes (test/app.test.ts).
import { randomUUID } from "node:crypto";
import Fastify, { type FastifyBaseLogger } from "fastify";
import { pino } from "pino";
import { registerErrorHandling } from "./lib/errors";
import { type HealthChecks, healthRoutes } from "./modules/health/routes";

export interface AppOptions {
  /** Omit for no logging (tests). */
  logger?: FastifyBaseLogger;
  /** Number of trusted reverse-proxy hops; 0 = ignore X-Forwarded-For. */
  trustProxyHops?: number;
  healthChecks: HealthChecks;
}

// Accept a caller's request ID only if it looks like one, so it can't be
// used to inject junk into logs.
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{8,128}$/;

export async function buildApp(options: AppOptions) {
  const hops = options.trustProxyHops ?? 0;
  const app = Fastify({
    loggerInstance: options.logger ?? pino({ level: "silent" }),
    // Trust only the nearest `hops` proxies (hop 0 = the one that connected
    // to us), so the client IP is read from the right end of X-Forwarded-For.
    trustProxy: hops > 0 ? (_address: string, hop: number) => hop < hops : false,
    requestIdHeader: false,
    genReqId: (req) => {
      const incoming = req.headers["x-request-id"];
      return typeof incoming === "string" && REQUEST_ID_PATTERN.test(incoming)
        ? incoming
        : randomUUID();
    },
  });

  app.addHook("onSend", async (req, reply) => {
    reply.header("x-request-id", req.id);
  });

  registerErrorHandling(app);

  await app.register(healthRoutes(options.healthChecks));

  // Domain modules register their routes here as they're built
  // (auth, vault, orgs, ...), each as its own plugin.

  return app;
}
