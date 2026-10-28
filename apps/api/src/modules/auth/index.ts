// Public API of the auth module: signup, login, session state, password
// change, recovery, and the /auth/* routes (including the MFA challenge).
import type { DbHandles } from "../../db/types";
import { createAuthRepository } from "./auth.repository";
import { type AuthDeps, type AuthService, createAuthService } from "./auth.service";

export { authRoutes } from "./auth.routes";
export type { AuthService } from "./auth.service";

export function createAuthModule(deps: Omit<AuthDeps, "repo"> & { db: DbHandles }): AuthService {
  const { db, ...rest } = deps;
  return createAuthService({ ...rest, repo: createAuthRepository(db) });
}
