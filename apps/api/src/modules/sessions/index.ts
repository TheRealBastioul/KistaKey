// Public API of the sessions module: create, validate (Redis-cached),
// revoke. The /me/sessions routes live in the devices module, next to the
// device list they belong with.
import type { Redis } from "ioredis";
import type { DbHandles } from "../../db/types";
import { createSessionsRepository } from "./sessions.repository";
import { createSessionsService, type SessionsService } from "./sessions.service";

export type { SessionContext, SessionsService } from "./sessions.service";

export function createSessionsModule(db: DbHandles, redis: Redis): SessionsService {
  return createSessionsService(createSessionsRepository(db), redis);
}
