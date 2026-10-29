import type { FastifyPluginAsync } from "fastify";
import { AppError } from "../../lib/errors";
import { requireAuth } from "../../plugins/auth";
import { byUser, rateLimits } from "../../plugins/rate-limit";
import type { RealtimeModule } from "./index";

const MINUTE = 60_000;

/**
 * `GET /vault/events`: a Server-Sent Events stream for the signed-in user.
 * Sends `ready` once subscribed (the client syncs then), `vault` with
 * `{ revision }` after each committed change, and a comment heartbeat. The
 * session is re-checked on every heartbeat; a revoked or expired one ends
 * the stream, and so does the max lifetime (the client reconnects through
 * the full auth hook).
 */
export function realtimeRoutes(realtime: RealtimeModule): FastifyPluginAsync {
  return async (app) => {
    const { hub, settings } = realtime;
    const open = new Set<() => void>();
    const perUser = new Map<string, number>();
    const connectLimit = rateLimits(app, [
      { name: "vault-events-user", max: 30, windowMs: MINUTE, key: byUser },
    ]);

    // Open streams would otherwise keep app.close() waiting.
    app.addHook("preClose", async () => {
      for (const close of [...open]) close();
    });

    app.get("/vault/events", { preHandler: connectLimit }, async (req, reply) => {
      const auth = requireAuth(req);
      const userId = auth.user.id;
      if ((perUser.get(userId) ?? 0) >= settings.maxStreamsPerUser) {
        throw new AppError(429, "RATE_LIMITED", "Too many open connections");
      }

      const res = reply.raw;
      let started = false;
      let closed = false;
      const send = (event: string, data: unknown) => {
        if (started && !closed) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      };

      // Subscribe before taking over the response, so a failure is a normal error reply.
      const unsubscribe = await hub.subscribeVault(userId, (event) => send("vault", event));
      perUser.set(userId, (perUser.get(userId) ?? 0) + 1);

      let heartbeat: ReturnType<typeof setInterval> | undefined;
      let lifetime: ReturnType<typeof setTimeout> | undefined;
      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        clearTimeout(lifetime);
        unsubscribe();
        open.delete(close);
        const left = (perUser.get(userId) ?? 1) - 1;
        if (left > 0) perUser.set(userId, left);
        else perUser.delete(userId);
        if (!res.writableEnded) res.end();
      };
      open.add(close);
      req.raw.on("close", close);
      res.on("error", close);

      reply.hijack();
      res.writeHead(200, {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-store, no-transform",
        connection: "keep-alive",
        // Tells nginx-style proxies not to buffer the stream.
        "x-accel-buffering": "no",
        "x-request-id": req.id,
      });
      started = true;
      res.write(`retry: ${settings.retryMs}\n\n`);
      send("ready", {});

      const beat = async () => {
        try {
          const valid = await realtime.streamStillValid(userId, auth.session.tokenHash);
          if (!valid) return close();
        } catch (err) {
          // Redis or DB hiccup: keep the stream, the next beat checks again.
          req.log.warn({ err }, "realtime session check failed");
        }
        if (!closed) res.write(": ping\n\n");
      };
      heartbeat = setInterval(() => void beat(), settings.heartbeatMs);
      lifetime = setTimeout(close, settings.maxStreamMs);
    });
  };
}
