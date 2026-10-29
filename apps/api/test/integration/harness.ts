// Shared setup for auth integration tests: the real app + modules against
// TEST_DATABASE_URL and TEST_REDIS_URL, emails captured in memory, and a
// small cookie-jar client that does the CSRF dance like the web app.
import "dotenv/config";
import { randomBytes } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import * as crypto from "@repo/crypto";
import type { KdfParams, SessionResponse } from "@repo/types";
import type { FastifyInstance } from "fastify";
import { Redis } from "ioredis";
import { buildApp } from "../../src/app";
import { LEGAL_DOCUMENTS } from "../../src/config/legal";
import { createSecurityConfig } from "../../src/config/security";
import { PrismaClient } from "../../src/generated/prisma/client";
import { base32Decode, hotp, totpStep } from "../../src/lib/totp";
import { type AppModules, createModules } from "../../src/modules";
import type { EmailMessage } from "../../src/modules/email";
import type { StreamSettings } from "../../src/modules/realtime";

export const dbUrl = process.env.TEST_DATABASE_URL;
export const redisUrl = process.env.TEST_REDIS_URL;
export const canRun = Boolean(dbUrl && redisUrl);

/** Cheapest client KDF params the API accepts, to keep the suite fast. */
export const FAST_KDF: KdfParams = {
  alg: "argon2id",
  memoryKiB: 19 * 1024,
  iterations: 2,
  parallelism: 1,
};

export interface Harness {
  app: FastifyInstance;
  modules: AppModules;
  prisma: PrismaClient;
  redis: Redis;
  emails: EmailMessage[];
  /**
   * Another API instance: its own modules, Redis connection and app, the
   * same database, Redis and keys (so sessions work on both). Closed with
   * the harness.
   */
  addInstance(): Promise<{ app: FastifyInstance; modules: AppModules }>;
  close(): Promise<void>;
}

export interface HarnessOptions {
  streams?: Partial<StreamSettings>;
}

export async function createHarness(options: HarnessOptions = {}): Promise<Harness> {
  await crypto.ready();
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: dbUrl ?? "" }) });
  const redis = new Redis(redisUrl ?? "");
  // Fresh rate-limit counters, session cache and challenges for every run.
  await redis.flushdb();

  const emails: EmailMessage[] = [];
  const config = createSecurityConfig({
    appOrigin: "http://localhost:5173",
    encryptionKey: randomBytes(32),
    hmacKey: randomBytes(32),
    secretHash: { memoryKiB: 64, passes: 2, parallelism: 1 },
  });
  const build = (instanceRedis: Redis) =>
    createModules({
      db: { writer: prisma, reader: prisma },
      redis: instanceRedis,
      config,
      email: {
        async send(message) {
          emails.push(message);
        },
      },
      ...(options.streams ? { streams: options.streams } : {}),
    });
  const modules = build(redis);
  await modules.legal.seed(LEGAL_DOCUMENTS);
  const app = await buildApp({ healthChecks: {}, modules });

  const extra: { app: FastifyInstance; modules: AppModules; redis: Redis }[] = [];

  return {
    app,
    modules,
    prisma,
    redis,
    emails,
    async addInstance() {
      const instanceRedis = new Redis(redisUrl ?? "");
      const instanceModules = build(instanceRedis);
      const instanceApp = await buildApp({ healthChecks: {}, modules: instanceModules });
      extra.push({ app: instanceApp, modules: instanceModules, redis: instanceRedis });
      return { app: instanceApp, modules: instanceModules };
    },
    async close() {
      for (const instance of [{ app, modules, redis }, ...extra]) {
        await instance.app.close();
        instance.modules.realtime.close();
        instance.redis.disconnect();
      }
      await prisma.$disconnect();
    },
  };
}

let ipCounter = 0;
/** A distinct client IP per client, so rate limits don't leak between tests. */
export function nextIp(): string {
  ipCounter += 1;
  return `10.${(ipCounter >> 8) & 255}.${ipCounter & 255}.${(process.pid % 250) + 1}`;
}

export function uniqueEmail(label: string): string {
  return `${label}-${randomBytes(6).toString("hex")}@example.test`;
}

interface Res {
  statusCode: number;
  body: unknown;
  json<T = Record<string, unknown>>(): T;
}

/** A browser: cookie jar + CSRF token, one IP. */
export class Client {
  private readonly cookies = new Map<string, string>();
  private csrf: string | undefined;

  constructor(
    private readonly app: FastifyInstance,
    readonly ip = nextIp(),
  ) {}

  cookie(name: string): string | undefined {
    return this.cookies.get(name);
  }

  /** The Cookie header this browser would send (for real HTTP requests, e.g. SSE). */
  cookieHeader(): string {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  async request(
    method: "GET" | "POST" | "PUT" | "DELETE",
    url: string,
    body?: unknown,
    opts: { csrf?: boolean } = {},
  ): Promise<Res> {
    if (method !== "GET" && opts.csrf !== false && !this.csrf) {
      const res = await this.request("GET", "/auth/csrf");
      this.csrf = res.json<{ token: string }>().token;
    }
    const headers: Record<string, string> = {};
    if (this.cookies.size > 0) {
      headers.cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
    }
    if (method !== "GET" && opts.csrf !== false && this.csrf) headers["x-csrf-token"] = this.csrf;

    const res = await this.app.inject({
      method,
      url,
      headers,
      remoteAddress: this.ip,
      ...(body === undefined ? {} : { payload: body as Record<string, unknown> }),
    });
    for (const c of res.cookies as {
      name: string;
      value: string;
      maxAge?: number;
      expires?: Date;
    }[]) {
      const expired = c.value === "" || c.maxAge === 0 || (c.expires && c.expires < new Date());
      if (expired) this.cookies.delete(c.name);
      else this.cookies.set(c.name, c.value);
    }
    return { statusCode: res.statusCode, body: res.body, json: () => res.json() };
  }
}

export interface Account {
  email: string;
  password: string;
  created: crypto.NewAccount;
}

/** Signs up through the API (client-side crypto included) and verifies the email. */
export async function signupVerified(h: Harness, client: Client, label: string): Promise<Account> {
  const email = uniqueEmail(label);
  const password = `pw-${randomBytes(8).toString("hex")}`;
  const created = await crypto.createAccount(password, FAST_KDF);
  const legal = (await client.request("GET", "/legal/current")).json<{
    documents: { key: string; version: number }[];
  }>();

  const signup = await client.request("POST", "/auth/signup", {
    email,
    ...created.material,
    acceptedLegal: legal.documents.map((d) => ({ key: d.key, version: d.version })),
  });
  if (signup.statusCode !== 200) throw new Error(`signup failed: ${signup.body}`);

  const token = verificationToken(h, email);
  const verify = await client.request("POST", "/auth/verify-email", { token });
  if (verify.statusCode !== 200) throw new Error(`verify failed: ${verify.body}`);
  return { email, password, created };
}

export function verificationToken(h: Harness, email: string): string {
  const mail = h.emails.findLast((m) => m.to === email && m.template === "verify_email");
  if (mail?.template !== "verify_email") throw new Error(`no verification email for ${email}`);
  return new URL(mail.data.link).hash.replace("#token=", "");
}

export async function login(client: Client, email: string, password: string) {
  const pre = (await client.request("POST", "/auth/prelogin", { email })).json<{
    kdf: KdfParams;
    kdfSalt: string;
  }>();
  const keys = await crypto.deriveLoginKeys(password, pre.kdfSalt, pre.kdf);
  const res = await client.request("POST", "/auth/login", { email, authKey: keys.authKey });
  return { res, encKey: keys.encKey, authKey: keys.authKey };
}

/** Current TOTP code for a base32 secret, a few steps ahead so it never collides with a used one. */
export function totpCode(secret: string, stepOffset = 0): string {
  return hotp(base32Decode(secret), totpStep(Date.now()) + stepOffset);
}

/** Signup → verify → login → TOTP setup. Returns a ready client + the TOTP secret. */
export async function readyAccount(h: Harness, label: string) {
  const client = new Client(h.app);
  const account = await signupVerified(h, client, label);
  const { res } = await login(client, account.email, account.password);
  if (res.json<SessionResponse>().step !== "mfa_setup") throw new Error(`unexpected ${res.body}`);
  const setup = (await client.request("POST", "/me/mfa/totp/setup")).json<{ secret: string }>();
  const confirm = await client.request("POST", "/me/mfa/totp/confirm", {
    code: totpCode(setup.secret),
  });
  if (confirm.statusCode !== 200) throw new Error(`totp confirm failed: ${confirm.body}`);
  const recoveryCodes = confirm.json<{ recoveryCodes: string[] }>().recoveryCodes;
  return { client, account, totpSecret: setup.secret, recoveryCodes };
}
