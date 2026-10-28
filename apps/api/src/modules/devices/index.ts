// Public API of the devices module: device cookie → device row, trust,
// revocation, and the /me/devices + /me/sessions routes.
import type { DbHandles } from "../../db/types";
import type { AuditService } from "../audit";
import type { SessionsService } from "../sessions";
import { createDevicesRepository } from "./devices.repository";
import { createDevicesService, type DevicesService } from "./devices.service";

export { devicesRoutes } from "./devices.routes";
export type { DevicesService } from "./devices.service";

export function createDevicesModule(
  db: DbHandles,
  sessions: SessionsService,
  audit: AuditService,
): DevicesService {
  return createDevicesService(createDevicesRepository(db), sessions, audit);
}
