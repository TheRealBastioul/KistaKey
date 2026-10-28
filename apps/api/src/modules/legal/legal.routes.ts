import { LegalAcceptRequestSchema, type LegalCurrentResponse, type OkResponse } from "@repo/types";
import type { FastifyPluginAsync } from "fastify";
import { requestMeta } from "../../lib/http";
import { requireAuth } from "../../plugins/auth";
import type { LegalService } from "./legal.service";

export function legalRoutes(legal: LegalService): FastifyPluginAsync {
  return async (app) => {
    // Public: shown on the signup page and the legal pages.
    app.get(
      "/legal/current",
      { config: { auth: "public" } },
      async (): Promise<LegalCurrentResponse> => ({ documents: await legal.current() }),
    );

    // The acceptance gate. Clients refetch GET /auth/session afterwards.
    app.post(
      "/me/legal/accept",
      { config: { auth: { allow: ["legal"] } } },
      async (req): Promise<OkResponse> => {
        const body = LegalAcceptRequestSchema.parse(req.body);
        await legal.accept(requireAuth(req).user.id, body.accepted, requestMeta(req));
        return { ok: true };
      },
    );
  };
}
