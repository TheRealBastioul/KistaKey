// Public API of the legal module: versioned Terms / Privacy, pending
// acceptance check (used by the auth gate) and acceptance.
import type { DbHandles } from "../../db/types";
import type { AuditService } from "../audit";
import { createLegalRepository } from "./legal.repository";
import { createLegalService, type LegalService } from "./legal.service";

export { legalRoutes } from "./legal.routes";
export type { LegalService } from "./legal.service";

export function createLegalModule(db: DbHandles, audit: AuditService): LegalService {
  return createLegalService(createLegalRepository(db), audit);
}
