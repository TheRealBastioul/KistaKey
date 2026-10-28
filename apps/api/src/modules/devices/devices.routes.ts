import {
  type DeviceListResponse,
  IdParamsSchema,
  type OkResponse,
  type SessionListResponse,
} from "@repo/types";
import type { FastifyPluginAsync } from "fastify";
import { requestMeta } from "../../lib/http";
import { actorOf } from "../../plugins/auth";
import type { DevicesService } from "./devices.service";

/** Settings → Security: devices and sessions. All need a fully signed-in session. */
export function devicesRoutes(devices: DevicesService): FastifyPluginAsync {
  return async (app) => {
    app.get("/me/devices", async (req): Promise<DeviceListResponse> => {
      const actor = actorOf(req);
      return { devices: await devices.list(actor.tenant, actor.deviceId) };
    });

    app.delete("/me/devices/:id", async (req): Promise<OkResponse> => {
      const { id } = IdParamsSchema.parse(req.params);
      await devices.revoke(actorOf(req), id, requestMeta(req));
      return { ok: true };
    });

    app.get("/me/sessions", async (req): Promise<SessionListResponse> => {
      return { sessions: await devices.listSessions(actorOf(req)) };
    });

    app.delete("/me/sessions/:id", async (req): Promise<OkResponse> => {
      const { id } = IdParamsSchema.parse(req.params);
      await devices.revokeSession(actorOf(req), id, requestMeta(req));
      return { ok: true };
    });
  };
}
