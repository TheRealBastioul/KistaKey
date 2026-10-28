# Commands to run (Phases 1–2 verification)

Phase 1 (crypto core & API contract) and Phase 2 (auth API) are built but
nothing has been run yet. Run from the repo root on your machine, in
order. Tick each box as it passes. If a step fails, save its output to
`ref/error.md` and tell Claude:

```
<command> > ref\error.md 2>&1
```

## Setup

- [X] `pnpm install` (new deps: libsodium, @fastify/cookie, @fastify/rate-limit, @simplewebauthn, nodemailer, qrcode)
  - If it complains about build scripts, tell Claude which package.
- [X] `node --version` shows **24.7 or newer** (the API uses Node's built-in Argon2id)
- [X] `pnpm services:down` then `pnpm services:up` (adds Mailpit: inbox at http://localhost:8025)
- [X] `apps/api/.env` has `APP_ORIGIN`, `SERVER_ENCRYPTION_KEY`, `SERVER_HMAC_KEY`, `MAIL_*`, `TEST_REDIS_URL` (already added for you; compare with `.env.example`)
- [X] `pnpm db:migrate --name accounts_auth` creates and applies the Phase 2 migration
  - Then run `pnpm db:migrate` again: it must say the schema is in sync (no new migration).

## Phase 1: crypto + types

- [X] `pnpm --filter @repo/crypto test` (known-answer vectors, tamper tests, account flows)
- [X] `pnpm --filter @repo/types test`
- [X] `pnpm --filter @repo/crypto typecheck`
- [X] `pnpm --filter @repo/types typecheck`

## Phase 2: auth API

- [X] `pnpm db:generate` (regenerates the Prisma client for the Phase 2 models; `--filter` runs skip Turbo, which normally does this, and Prisma 7's `migrate dev` no longer does it either)
- [X] `pnpm --filter @repo/api typecheck`
- [X] `pnpm --filter @repo/api test` (unit + integration; integration needs Postgres + Redis running)
  - The integration suite must not show "skipped": `TEST_DATABASE_URL` and `TEST_REDIS_URL` must be set.
- [X] `pnpm --filter @repo/api build`
- [X] `pnpm --filter @repo/api dev`: starts without errors and logs that it's listening (legal documents seeded). Stop with Ctrl+C.
- [X] `pnpm --filter @repo/api dev:worker`: logs `worker started` with queues `maintenance`, `email`. Stop with Ctrl+C.

## Checks (same as CI)

- [X] `pnpm lint`
- [ ] Commit, push, and check the GitHub Actions run is green (CI now starts a Redis service too)

## After everything passes

- [ ] Tell Claude "phases 1 and 2 verified"
