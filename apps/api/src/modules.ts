// Composition root: builds every domain module from its dependencies, in
// dependency order. The API (server.ts), the worker and the integration
// tests all call this, so they run the same wiring.
import type { Redis } from "ioredis";
import type { Logger } from "pino";
import type { SecurityConfig } from "./config/security";
import type { DbHandles } from "./db/types";
import { createAuditModule } from "./modules/audit";
import { createAuthModule } from "./modules/auth";
import { createDevicesModule } from "./modules/devices";
import type { EmailSender } from "./modules/email";
import { createLegalModule } from "./modules/legal";
import { createMfaModule } from "./modules/mfa";
import { createRealtimeModule, type StreamSettings } from "./modules/realtime";
import { createSessionsModule } from "./modules/sessions";
import { createUsersModule } from "./modules/users";
import { createVaultModule } from "./modules/vault";

export interface ModuleDeps {
  db: DbHandles;
  redis: Redis;
  config: SecurityConfig;
  email: EmailSender;
  /** For background failures that don't fail a request (realtime publish). */
  logger?: Logger;
  /** Overrides for the SSE streams (tests use short heartbeats). */
  streams?: Partial<StreamSettings>;
}

export function createModules({ db, redis, config, email, logger, streams }: ModuleDeps) {
  const audit = createAuditModule(db);
  const users = createUsersModule(db, redis);
  const sessions = createSessionsModule(db, redis);
  const devices = createDevicesModule(db, sessions, audit);
  const legal = createLegalModule(db, audit);
  const mfa = createMfaModule({ db, redis, config, users, sessions, devices, audit, email });
  const auth = createAuthModule({
    db,
    config,
    users,
    sessions,
    devices,
    mfa,
    legal,
    audit,
    email,
  });
  const realtime = createRealtimeModule({
    redis,
    sessions,
    users,
    onError: (err, msg) => logger?.warn({ err }, msg),
    ...(streams ? { settings: streams } : {}),
  });
  const vault = createVaultModule(db, audit, realtime.hub);
  return { config, redis, audit, users, sessions, devices, legal, mfa, auth, realtime, vault };
}

export type AppModules = ReturnType<typeof createModules>;
