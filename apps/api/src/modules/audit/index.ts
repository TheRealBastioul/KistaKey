// Public API of the audit module. Other modules import from here only,
// never from the files behind it.
import type { DbHandles } from "../../db/types";
import { createAuditRepository } from "./audit.repository";
import { type AuditService, createAuditService } from "./audit.service";

export type { AuditService, RecordAuditEvent } from "./audit.service";

export function createAuditModule(db: DbHandles): AuditService {
  return createAuditService(createAuditRepository(db));
}
