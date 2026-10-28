// Public API of the MFA module: enrollment + management routes, and the
// challenge verification the auth module's /auth/mfa/* routes call.
import type { DbHandles } from "../../db/types";
import { createMfaRepository } from "./mfa.repository";
import { createMfaService, type MfaDeps, type MfaService } from "./mfa.service";

export { mfaRoutes } from "./mfa.routes";
export { type MfaService, RECOVERY_CODE_COUNT } from "./mfa.service";

export function createMfaModule(deps: Omit<MfaDeps, "repo"> & { db: DbHandles }): MfaService {
  const { db, ...rest } = deps;
  return createMfaService({ ...rest, repo: createMfaRepository(db) });
}
