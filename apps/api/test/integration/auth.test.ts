// Auth flows (Phase 2) against real Postgres + Redis (skipped unless
// TEST_DATABASE_URL and TEST_REDIS_URL are set). Uses the real
// @repo/crypto on the "client" side, so what's stored is what a browser
// would send.
import * as crypto from "@repo/crypto";
import type { SessionResponse } from "@repo/types";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  Client,
  canRun,
  createHarness,
  FAST_KDF,
  type Harness,
  login,
  readyAccount,
  signupVerified,
  totpCode,
  uniqueEmail,
} from "./harness";

// Per-test timeout in ms. Vitest 5 only takes a number as the third argument.
const SLOW = 60_000;

describe.skipIf(!canRun)("auth (integration)", () => {
  let h: Harness;

  beforeAll(async () => {
    h = await createHarness();
  });

  afterAll(async () => {
    await h?.close();
  });

  it(
    "signup → verify → login → MFA setup → session → unlock → logout",
    async () => {
      const client = new Client(h.app);
      const account = await signupVerified(h, client, "flow");

      const { res, encKey } = await login(client, account.email, account.password);
      expect(res.statusCode).toBe(200);
      const first = res.json<SessionResponse>();
      expect(first.step).toBe("mfa_setup");
      expect(first.keys).toBeNull();

      // Gated until MFA is set up.
      const blocked = await client.request("GET", "/me/devices");
      expect(blocked.statusCode).toBe(403);
      expect(blocked.json<{ error: { code: string } }>().error.code).toBe("MFA_SETUP_REQUIRED");

      const setup = (await client.request("POST", "/me/mfa/totp/setup")).json<{
        secret: string;
        otpauthUri: string;
      }>();
      expect(setup.otpauthUri).toContain("otpauth://totp/");
      const confirm = await client.request("POST", "/me/mfa/totp/confirm", {
        code: totpCode(setup.secret),
      });
      expect(confirm.statusCode).toBe(200);
      expect(confirm.json<{ recoveryCodes: string[] }>().recoveryCodes).toHaveLength(10);

      const session = (await client.request("GET", "/auth/session")).json<SessionResponse>();
      expect(session.step).toBe("ready");
      expect(session.mfaMethods).toEqual(["totp", "recovery_code"]);
      expect(session.keys).not.toBeNull();

      // Unlock locally from what the server returned.
      const userKey = crypto.unlockWithEncKey(encKey, session.keys?.encryptedUserKey ?? "");
      expect(userKey).toEqual(account.created.userKey);

      expect((await client.request("POST", "/auth/logout")).statusCode).toBe(200);
      expect((await client.request("GET", "/auth/session")).statusCode).toBe(401);

      const actions = (
        await h.prisma.auditLog.findMany({
          where: { actorUserId: session.user.id },
          select: { action: true },
        })
      ).map((a) => a.action);
      for (const action of [
        "auth.signup",
        "legal.accepted",
        "auth.email_verified",
        "auth.login",
        "mfa.totp_enabled",
        "auth.logout",
      ]) {
        expect(actions).toContain(action);
      }
    },
    SLOW,
  );

  it(
    "a second login needs the second factor, and a used code can't be replayed",
    async () => {
      const { account, totpSecret } = await readyAccount(h, "mfa");
      const other = new Client(h.app);
      const { res } = await login(other, account.email, account.password);
      expect(res.json<SessionResponse>().step).toBe("mfa");
      expect((await other.request("GET", "/me/devices")).statusCode).toBe(403);

      const wrong = await other.request("POST", "/auth/mfa/totp", {
        method: "totp",
        code: "000000",
        trustDevice: false,
      });
      expect(wrong.statusCode).toBe(400);

      // The confirm used the current step; the next one is fresh.
      const code = totpCode(totpSecret, 1);
      const ok = await other.request("POST", "/auth/mfa/totp", {
        method: "totp",
        code,
        trustDevice: false,
      });
      expect(ok.json<SessionResponse>().step).toBe("ready");

      const third = new Client(h.app);
      await login(third, account.email, account.password);
      const replay = await third.request("POST", "/auth/mfa/totp", {
        method: "totp",
        code,
        trustDevice: false,
      });
      expect(replay.statusCode).toBe(400);
    },
    SLOW,
  );

  it(
    "recovery codes work once; a trusted device skips the prompt",
    async () => {
      const { account, recoveryCodes } = await readyAccount(h, "trust");
      const code = recoveryCodes[0] ?? "";
      const browser = new Client(h.app);
      await login(browser, account.email, account.password);
      const ok = await browser.request("POST", "/auth/mfa/totp", {
        method: "recovery_code",
        code: code.toLowerCase(),
        trustDevice: true,
      });
      expect(ok.json<SessionResponse>().step).toBe("ready");

      // Same browser (device cookie kept), new session: trusted, no prompt.
      await browser.request("POST", "/auth/logout");
      const again = await login(browser, account.email, account.password);
      expect(again.res.json<SessionResponse>().step).toBe("ready");

      const elsewhere = new Client(h.app);
      await login(elsewhere, account.email, account.password);
      const reuse = await elsewhere.request("POST", "/auth/mfa/totp", {
        method: "recovery_code",
        code,
        trustDevice: false,
      });
      expect(reuse.statusCode).toBe(400);
    },
    SLOW,
  );

  it(
    "wrong password and unknown email get identical answers",
    async () => {
      const client = new Client(h.app);
      const account = await signupVerified(h, client, "enum");

      const wrong = await login(client, account.email, "not the password");
      const unknown = await login(client, uniqueEmail("nobody"), "whatever");
      const strip = (body: unknown) => {
        const parsed = JSON.parse(String(body)) as { error: { requestId?: string } };
        delete parsed.error.requestId;
        return parsed;
      };
      expect(wrong.res.statusCode).toBe(401);
      expect(unknown.res.statusCode).toBe(401);
      expect(strip(wrong.res.body)).toEqual(strip(unknown.res.body));
    },
    SLOW,
  );

  it("prelogin gives unknown emails a stable fake salt with the real shape", async () => {
    const client = new Client(h.app);
    const email = uniqueEmail("ghost");
    const a = (await client.request("POST", "/auth/prelogin", { email })).json();
    const b = (await client.request("POST", "/auth/prelogin", { email })).json();
    expect(a).toEqual(b);
    expect(a).toMatchObject({ kdf: crypto.DEFAULT_KDF_PARAMS });
    expect(a.kdfSalt).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });

  it(
    "signup with a taken email answers the same and emails the owner",
    async () => {
      const client = new Client(h.app);
      const account = await signupVerified(h, client, "dupe");
      const again = await crypto.createAccount("another", FAST_KDF);
      const legal = (await client.request("GET", "/legal/current")).json<{
        documents: { key: string; version: number }[];
      }>();
      const res = await client.request("POST", "/auth/signup", {
        email: account.email,
        ...again.material,
        acceptedLegal: legal.documents.map((d) => ({ key: d.key, version: d.version })),
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ status: "verification_sent" });
      expect(h.emails.some((m) => m.to === account.email && m.template === "signup_existing")).toBe(
        true,
      );
    },
    SLOW,
  );

  it("unsafe requests without a CSRF token are rejected", async () => {
    const client = new Client(h.app);
    const res = await client.request(
      "POST",
      "/auth/prelogin",
      { email: uniqueEmail("csrf") },
      { csrf: false },
    );
    expect(res.statusCode).toBe(403);
    expect(res.json<{ error: { code: string } }>().error.code).toBe("CSRF_INVALID");
  });

  it("login is rate limited per IP", async () => {
    const client = new Client(h.app);
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) {
      const res = await client.request("POST", "/auth/login", {
        email: uniqueEmail(`rl${i}`),
        authKey: "A".repeat(43),
      });
      statuses.push(res.statusCode);
    }
    expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
    expect(statuses[10]).toBe(429);
  });

  it(
    "a revoked session is rejected on its very next request",
    async () => {
      const { client: a, account, totpSecret } = await readyAccount(h, "revoke");
      const b = new Client(h.app);
      await login(b, account.email, account.password);
      await b.request("POST", "/auth/mfa/totp", {
        method: "totp",
        code: totpCode(totpSecret, 1),
        trustDevice: false,
      });
      expect((await b.request("GET", "/auth/session")).statusCode).toBe(200);

      const list = (await a.request("GET", "/me/sessions")).json<{
        sessions: { id: string; current: boolean }[];
      }>();
      expect(list.sessions).toHaveLength(2);
      const bSession = list.sessions.find((s) => !s.current);
      expect((await a.request("DELETE", `/me/sessions/${bSession?.id}`)).statusCode).toBe(200);

      expect((await b.request("GET", "/auth/session")).statusCode).toBe(401);
      expect((await a.request("GET", "/auth/session")).statusCode).toBe(200);
    },
    SLOW,
  );

  it(
    "password change keeps this session, revokes others, retires the old password",
    async () => {
      const { client: a, account, totpSecret } = await readyAccount(h, "pwchange");
      const b = new Client(h.app);
      await login(b, account.email, account.password);
      await b.request("POST", "/auth/mfa/totp", {
        method: "totp",
        code: totpCode(totpSecret, 1),
        trustDevice: false,
      });

      const keys = (await a.request("GET", "/auth/session")).json<SessionResponse>().keys;
      if (!keys) throw new Error("no keys");
      const change = await crypto.changeMasterPassword(
        account.password,
        "new master password",
        keys,
        FAST_KDF,
      );
      const res = await a.request("POST", "/me/password", {
        currentAuthKey: change.currentAuthKey,
        next: change.next,
      });
      expect(res.statusCode).toBe(200);

      expect((await a.request("GET", "/auth/session")).statusCode).toBe(200);
      expect((await b.request("GET", "/auth/session")).statusCode).toBe(401);

      const old = await login(new Client(h.app), account.email, account.password);
      expect(old.res.statusCode).toBe(401);
      const fresh = await login(new Client(h.app), account.email, "new master password");
      expect(fresh.res.statusCode).toBe(200);
    },
    SLOW,
  );

  it(
    "recovery restores access, invalidates the old password and every session",
    async () => {
      const { client: a, account } = await readyAccount(h, "recover");
      const stranger = new Client(h.app);

      const start = await crypto.startRecovery(account.created.recoveryKey);
      const started = await stranger.request("POST", "/auth/recover/start", {
        email: account.email,
        recoveryAuthKey: start.recoveryAuthKey,
      });
      expect(started.statusCode).toBe(200);
      const { recoveryToken, recoveryWrappedUserKey } = started.json<{
        recoveryToken: string;
        recoveryWrappedUserKey: string;
      }>();

      const done = await crypto.completeRecovery(
        start.wrapKey,
        recoveryWrappedUserKey,
        "recovered password",
        FAST_KDF,
      );
      expect(done.userKey).toEqual(account.created.userKey);
      const complete = await stranger.request("POST", "/auth/recover/complete", {
        recoveryToken,
        ...done.material,
      });
      expect(complete.statusCode).toBe(200);

      expect((await a.request("GET", "/auth/session")).statusCode).toBe(401);
      expect((await login(new Client(h.app), account.email, account.password)).res.statusCode).toBe(
        401,
      );
      const after = await login(new Client(h.app), account.email, "recovered password");
      // Recovery doesn't bypass the second factor.
      expect(after.res.json<SessionResponse>().step).toBe("mfa");

      // The old recovery key is spent; the token too.
      const reuse = await stranger.request("POST", "/auth/recover/complete", {
        recoveryToken,
        ...done.material,
      });
      expect(reuse.statusCode).toBe(400);
      const oldKey = await stranger.request("POST", "/auth/recover/start", {
        email: account.email,
        recoveryAuthKey: start.recoveryAuthKey,
      });
      expect(oldKey.statusCode).toBe(401);
    },
    SLOW,
  );

  it(
    "recovery drops MFA trust, so a trusted browser is challenged again",
    async () => {
      const { account, recoveryCodes } = await readyAccount(h, "recovertrust");
      const browser = new Client(h.app);
      await login(browser, account.email, account.password);
      await browser.request("POST", "/auth/mfa/totp", {
        method: "recovery_code",
        code: recoveryCodes[0] ?? "",
        trustDevice: true,
      });
      await browser.request("POST", "/auth/logout");

      const start = await crypto.startRecovery(account.created.recoveryKey);
      const started = (
        await browser.request("POST", "/auth/recover/start", {
          email: account.email,
          recoveryAuthKey: start.recoveryAuthKey,
        })
      ).json<{ recoveryToken: string; recoveryWrappedUserKey: string }>();
      const done = await crypto.completeRecovery(
        start.wrapKey,
        started.recoveryWrappedUserKey,
        "recovered password",
        FAST_KDF,
      );
      const complete = await browser.request("POST", "/auth/recover/complete", {
        recoveryToken: started.recoveryToken,
        ...done.material,
      });
      expect(complete.statusCode).toBe(200);

      // Same browser (device cookie kept), which was trusted before.
      const after = await login(browser, account.email, "recovered password");
      expect(after.res.json<SessionResponse>().step).toBe("mfa");
    },
    SLOW,
  );

  it(
    "the users row holds no readable key material",
    async () => {
      const client = new Client(h.app);
      const account = await signupVerified(h, client, "dbcheck");
      const { created } = account;
      const master = crypto.deriveMasterKey(
        account.password,
        crypto.fromBase64Url(created.material.kdfSalt),
        FAST_KDF,
      );
      const { authKey, encKey } = await crypto.deriveSubKeys(master);
      const recovery = await crypto.deriveRecoveryKeys(
        crypto.parseRecoveryKey(created.recoveryKey),
      );

      const row = await h.prisma.user.findUniqueOrThrow({ where: { email: account.email } });
      const stored = JSON.stringify(row);
      const forbidden = {
        password: account.password,
        masterKey: crypto.toBase64Url(master),
        authKey: crypto.toBase64Url(authKey),
        encKey: crypto.toBase64Url(encKey),
        userKey: crypto.toBase64Url(created.userKey),
        recoveryKey: created.recoveryKey,
        recoveryKeyRaw: crypto.toBase64Url(crypto.parseRecoveryKey(created.recoveryKey)),
        recoveryAuthKey: crypto.toBase64Url(recovery.authKey),
        recoveryWrapKey: crypto.toBase64Url(recovery.wrapKey),
      };
      for (const [name, value] of Object.entries(forbidden)) {
        expect(stored.includes(value), `${name} found in users row`).toBe(false);
      }
      for (const [name, bytes] of Object.entries({
        master,
        authKey,
        encKey,
        userKey: created.userKey,
      })) {
        expect(stored.includes(crypto.toHex(bytes)), `${name} (hex) found in users row`).toBe(
          false,
        );
      }
      expect(row.authHash.startsWith("$argon2id$")).toBe(true);
      expect(row.recoveryAuthHash.startsWith("$argon2id$")).toBe(true);
    },
    SLOW,
  );
});
