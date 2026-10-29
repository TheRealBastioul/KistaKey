// Public API of the vault module: personal items + folders, sync, trash,
// batch import, the purge job, and the /vault/* routes.
import type { DbHandles } from "../../db/types";
import type { AuditService } from "../audit";
import { createVaultRepository } from "./vault.repository";
import { createVaultService, type VaultEvents, type VaultService } from "./vault.service";

export { vaultRoutes } from "./vault.routes";
export type { VaultEvents, VaultService } from "./vault.service";

export function createVaultModule(
  db: DbHandles,
  audit: AuditService,
  events: VaultEvents,
): VaultService {
  return createVaultService(createVaultRepository(db), audit, events);
}
