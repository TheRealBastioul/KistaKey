import { z } from "zod";
import { IsoDateSchema } from "./common";

export const DeviceKindSchema = z.enum(["web", "extension", "mobile"]);
export type DeviceKind = z.infer<typeof DeviceKindSchema>;

/** GET /me/devices item. Revoked devices aren't listed. */
export const DeviceSchema = z.object({
  id: z.uuid(),
  kind: DeviceKindSchema,
  name: z.string(),
  trustedUntil: IsoDateSchema.nullable(),
  firstSeenAt: IsoDateSchema,
  lastSeenAt: IsoDateSchema,
  /** The device making this request. */
  current: z.boolean(),
});
export type Device = z.infer<typeof DeviceSchema>;

export const DeviceListResponseSchema = z.object({ devices: z.array(DeviceSchema) });
export type DeviceListResponse = z.infer<typeof DeviceListResponseSchema>;

/** GET /me/sessions item. Only live sessions are listed. */
export const SessionInfoSchema = z.object({
  id: z.uuid(),
  deviceId: z.uuid(),
  deviceName: z.string(),
  ipAddress: z.string().nullable(),
  userAgent: z.string().nullable(),
  createdAt: IsoDateSchema,
  lastSeenAt: IsoDateSchema,
  current: z.boolean(),
});
export type SessionInfo = z.infer<typeof SessionInfoSchema>;

export const SessionListResponseSchema = z.object({ sessions: z.array(SessionInfoSchema) });
export type SessionListResponse = z.infer<typeof SessionListResponseSchema>;
