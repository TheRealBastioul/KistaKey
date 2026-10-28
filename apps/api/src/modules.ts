// Composition root: builds every domain module from its dependencies, in
// dependency order. The API (server.ts), the worker and the integration
// tests all call this, so they run the same wiring.
import type { Redis } from "ioredis";
import type { SecurityConfig } from "./config/security";
import type { DbHandles } from "./db/types";
import { createAuditModule } from "./modules/audit";
import { createAuthModule } from "./modules/auth";
import { createDevicesModule } from "./modules/devices";
import type { EmailSender } from "./modules/email";
import { createLegalModule } from "./modules/legal";
import { createMfaModule } from "./modules/mfa";
import { createSessionsModule } from "./modules/sessions";
import { createUsersModule } from "./modules/users";

export interface ModuleDeps {
  db: DbHandles;
  redis: Redis;
  config: SecurityConfig;
  email: EmailSender;
}

export function createModules({ db, redis, config, email }: ModuleDeps) {
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
  return { config, redis, audit, users, sessions, devices, legal, mfa, auth };
}

export type AppModules = ReturnType<typeof createModules>;
