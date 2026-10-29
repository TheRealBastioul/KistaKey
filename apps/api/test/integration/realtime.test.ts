// Realtime vault sync (Phase 10) against real Postgres + Redis (skipped
// unless TEST_DATABASE_URL and TEST_REDIS_URL are set). Two API instances
// share Redis: a write through instance A reaches an SSE stream on B.
import { randomUUID } from "node:crypto";
import { get } from "node:http";
import * as crypto from "@repo/crypto";
import type { ItemResponse, VaultItem } from "@repo/types";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AppModules } from "../../src/modules";
import {
  Client,
  canRun,
  createHarness,
  type Harness,
  login,
  readyAccount,
  totpCode,
} from "./harness";

const SLOW = 60_000;
const HEARTBEAT_MS = 200;

type Ready = Awaited<ReturnType<typeof readyAccount>>;

interface SseEvent {
  event: string;
  data: unknown;
}

interface Stream {
  status: number;
  /** Resolves with the data of the next `type` event after the last one taken. */
  next(type: string, timeoutMs?: number): Promise<unknown>;
  ended: Promise<void>;
  close(): void;
}

/** A real HTTP SSE connection (inject buffers the whole response, so it can't stream). */
function openStream(baseUrl: string, cookie: string): Promise<Stream> {
  return new Promise((resolve, reject) => {
    const req = get(`${baseUrl}/vault/events`, { headers: { cookie } }, (res) => {
      const events: SseEvent[] = [];
      const waiters = new Set<() => boolean>();
      let buffer = "";
      let cursor = 0;

      res.setEncoding("utf8");
      res.on("data", (chunk: string) => {
        buffer += chunk;
        for (let end = buffer.indexOf("\n\n"); end >= 0; end = buffer.indexOf("\n\n")) {
          const frame = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          let event = "";
          let data = "";
          for (const line of frame.split("\n")) {
            if (line.startsWith("event: ")) event = line.slice(7);
            else if (line.startsWith("data: ")) data += line.slice(6);
          }
          if (event) events.push({ event, data: JSON.parse(data) });
        }
        for (const waiter of [...waiters]) if (waiter()) waiters.delete(waiter);
      });
      const ended = new Promise<void>((done) => res.on("close", () => done()));

      resolve({
        status: res.statusCode ?? 0,
        ended,
        close: () => req.destroy(),
        next(type, timeoutMs = 5_000) {
          return new Promise((found, fail) => {
            const take = () => {
              while (cursor < events.length) {
                const e = events[cursor++] as SseEvent;
                if (e.event === type) {
                  found(e.data);
                  return true;
                }
              }
              return false;
            };
            if (take()) return;
            const timer = setTimeout(() => {
              waiters.delete(waiter);
              fail(new Error(`no "${type}" event within ${timeoutMs} ms`));
            }, timeoutMs);
            const waiter = () => {
              if (!take()) return false;
              clearTimeout(timer);
              return true;
            };
            waiters.add(waiter);
          });
        },
      });
    });
    req.on("error", reject);
  });
}

function newItem(userKey: Uint8Array, name: string) {
  const id = randomUUID();
  const data = { name, login: { username: "me", password: "pw", uris: [] } };
  return { id, type: "login" as const, folderId: null, ...crypto.encryptItem(userKey, id, data) };
}

async function create(client: Client, who: Ready, name: string): Promise<VaultItem> {
  const res = await client.request(
    "POST",
    "/vault/items",
    newItem(who.account.created.userKey, name),
  );
  expect(res.statusCode, String(res.body)).toBe(200);
  return res.json<ItemResponse>().item;
}

async function waitFor(check: () => boolean, timeoutMs = 3_000): Promise<void> {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error("condition not met in time");
    await new Promise((r) => setTimeout(r, 20));
  }
}

describe.skipIf(!canRun)("realtime (integration)", () => {
  let h: Harness;
  let b: { app: FastifyInstance; modules: AppModules };
  let bUrl: string;
  let alice: Ready;
  let bob: Ready;

  beforeAll(async () => {
    h = await createHarness({ streams: { heartbeatMs: HEARTBEAT_MS } });
    b = await h.addInstance();
    bUrl = await b.app.listen({ host: "127.0.0.1", port: 0 });
    alice = await readyAccount(h, "rt-a");
    bob = await readyAccount(h, "rt-b");
  }, SLOW);

  afterAll(async () => {
    await h?.close();
  });

  it("needs a signed-in session", async () => {
    const res = await new Client(h.app).request("GET", "/vault/events");
    expect(res.statusCode).toBe(401);
  });

  it(
    "a write through instance A reaches a stream on instance B, revision only",
    async () => {
      const stream = await openStream(bUrl, alice.client.cookieHeader());
      try {
        expect(stream.status).toBe(200);
        await stream.next("ready");
        expect(b.modules.realtime.hub.channelCount()).toBe(1);

        const item = await create(alice.client, alice, "Mail");
        const event = await stream.next("vault");
        expect(event).toEqual({ revision: item.revision });
      } finally {
        stream.close();
      }
      // The instance drops the channel once its last stream closes.
      await waitFor(() => b.modules.realtime.hub.channelCount() === 0);
    },
    SLOW,
  );

  it(
    "another user's stream gets none of these events",
    async () => {
      const stream = await openStream(bUrl, bob.client.cookieHeader());
      try {
        await stream.next("ready");
        await create(alice.client, alice, "Alice only");
        const own = await create(bob.client, bob, "Bob's");
        // Events arrive in order, so the first one Bob sees is his own.
        expect(await stream.next("vault")).toEqual({ revision: own.revision });
      } finally {
        stream.close();
      }
    },
    SLOW,
  );

  it(
    "a revoked session's stream ends on the next heartbeat",
    async () => {
      const other = new Client(h.app);
      await login(other, alice.account.email, alice.account.password);
      const mfa = await other.request("POST", "/auth/mfa/totp", {
        method: "totp",
        code: totpCode(alice.totpSecret, 1),
        trustDevice: false,
      });
      expect(mfa.statusCode, String(mfa.body)).toBe(200);

      const stream = await openStream(bUrl, other.cookieHeader());
      await stream.next("ready");

      const list = (await alice.client.request("GET", "/me/sessions")).json<{
        sessions: { id: string; current: boolean }[];
      }>();
      const otherSession = list.sessions.find((s) => !s.current);
      const revoke = await alice.client.request("DELETE", `/me/sessions/${otherSession?.id}`);
      expect(revoke.statusCode).toBe(200);

      const timeout = new Promise<string>((r) => setTimeout(() => r("open"), HEARTBEAT_MS * 10));
      expect(await Promise.race([stream.ended.then(() => "ended"), timeout])).toBe("ended");
      stream.close();
    },
    SLOW,
  );
});
