// Public API of the users module: account rows and the cached per-request
// user state. Other modules import from here only.
import type { Redis } from "ioredis";
import type { DbHandles } from "../../db/types";
import { createUsersRepository } from "./users.repository";
import { createUsersService, type UsersService } from "./users.service";

export type {
  NewUser,
  PasswordColumns,
  RecoveryColumns,
  UserState,
  UsersService,
} from "./users.service";

export function createUsersModule(db: DbHandles, redis: Redis): UsersService {
  return createUsersService(createUsersRepository(db), redis);
}
