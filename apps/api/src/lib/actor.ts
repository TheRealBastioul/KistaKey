import type { UserTenant } from "../db/tenant";

/**
 * Who is acting: the signed-in user, on one of their devices, in one
 * session. Built from request.auth (plugins/auth.ts `actorOf`); services take
 * it instead of the whole request.
 */
export interface Actor {
  tenant: UserTenant;
  userId: string;
  deviceId: string;
  sessionId: string;
}

export function auditActor(actor: Actor) {
  return { userId: actor.userId, deviceId: actor.deviceId };
}
