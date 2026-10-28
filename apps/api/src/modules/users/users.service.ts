import type { Redis } from "ioredis";
import type {
  NewUser,
  PasswordColumns,
  RecoveryColumns,
  UsersRepository,
} from "./users.repository";

/** What the auth hook checks on every request. Cached in Redis, dropped on change. */
export interface UserState {
  id: string;
  email: string;
  emailVerified: boolean;
  status: "active" | "deactivated";
  securityStamp: string;
  mfaEnabled: boolean;
}

const STATE_TTL_SECONDS = 300;
const stateKey = (userId: string) => `user:state:${userId}`;

export function createUsersService(repo: UsersRepository, redis: Redis) {
  async function invalidateState(userId: string): Promise<void> {
    await redis.del(stateKey(userId));
  }

  return {
    findByEmail: repo.findByEmail,
    findById: repo.findById,
    create: repo.create,
    invalidateState,

    async getState(userId: string): Promise<UserState | null> {
      const cached = await redis.get(stateKey(userId));
      if (cached) return JSON.parse(cached) as UserState;

      const row = await repo.findState(userId);
      if (!row) return null;
      const state: UserState = {
        id: row.id,
        email: row.email,
        emailVerified: row.emailVerifiedAt !== null,
        status: row.status,
        securityStamp: row.securityStamp,
        mfaEnabled: row.mfaTotp?.confirmedAt != null || row._count.webauthnCredentials > 0,
      };
      await redis.set(stateKey(userId), JSON.stringify(state), "EX", STATE_TTL_SECONDS);
      return state;
    },

    async markEmailVerified(userId: string): Promise<boolean> {
      const { count } = await repo.markEmailVerified(userId, new Date());
      await invalidateState(userId);
      return count > 0;
    },

    async updatePassword(userId: string, columns: PasswordColumns, securityStamp: string) {
      await repo.updatePassword(userId, columns, securityStamp);
      await invalidateState(userId);
    },

    async updateRecovery(userId: string, columns: RecoveryColumns) {
      await repo.updateRecovery(userId, columns);
    },

    async updatePasswordAndRecovery(
      userId: string,
      password: PasswordColumns,
      recovery: RecoveryColumns,
      securityStamp: string,
    ) {
      await repo.updatePasswordAndRecovery(userId, password, recovery, securityStamp);
      await invalidateState(userId);
    },
  };
}

export type UsersService = ReturnType<typeof createUsersService>;
export type { NewUser, PasswordColumns, RecoveryColumns };
