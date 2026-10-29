// Builds the Fastify app from injected dependencies. No env, DB or Redis
// imports here, so tests can build the real app with fakes (test/app.test.ts)
// or with test connections (test/integration/).
import { randomUUID } from "node:crypto";
import { fastifyCookie } from "@fastify/cookie";
import Fastify, { type FastifyBaseLogger } from "fastify";
import { pino } from "pino";
import { registerErrorHandling } from "./lib/errors";
import type { AppModules } from "./modules";
import { authRoutes } from "./modules/auth";
import { devicesRoutes } from "./modules/devices";
import { type HealthChecks, healthRoutes } from "./modules/health/routes";
import { legalRoutes } from "./modules/legal";
import { mfaRoutes } from "./modules/mfa";
import { realtimeRoutes } from "./modules/realtime";
import { vaultRoutes } from "./modules/vault";
import { registerAuth } from "./plugins/auth";
import { registerCsrf } from "./plugins/csrf";
import { registerRateLimit } from "./plugins/rate-limit";

export interface AppOptions {
  /** Omit for no logging (tests). */
  logger?: FastifyBaseLogger;
  /** Number of trusted reverse-proxy hops; 0 = ignore X-Forwarded-For. */
  trustProxyHops?: number;
  healthChecks: HealthChecks;
  /** Domain modules (src/modules.ts). Omit for a health-only app (unit tests). */
  modules?: AppModules;
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

  const modules = options.modules;
  if (modules) {
    // Hook order matters: cookies parsed → CSRF → session + gates.
    await app.register(fastifyCookie);
    await registerRateLimit(app, modules.redis);
    registerCsrf(app, modules.config);
    registerAuth(app, modules);
  }

  await app.register(healthRoutes(options.healthChecks));

  if (modules) {
    await app.register(authRoutes(modules.auth, modules.mfa, modules.config));
    await app.register(mfaRoutes(modules.mfa));
    await app.register(devicesRoutes(modules.devices));
    await app.register(legalRoutes(modules.legal));
    await app.register(vaultRoutes(modules.vault));
    await app.register(realtimeRoutes(modules.realtime));
  }

  return app;
}
