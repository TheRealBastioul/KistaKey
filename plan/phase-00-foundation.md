# Phase 00: Foundation
Status: Built, awaiting verification
Depends on: decisions §1–§10

## Goal

An empty but production-shaped monorepo. CI builds every app; API +
worker + web run locally against Postgres/Redis; one migration applies
cleanly.

## Requested (from the original plan)

- Monorepo (pnpm + Turborepo), TypeScript config, lint/format, CI.
- `apps/api` skeleton: Fastify, config, error handling, health check,
  structured logging, request IDs.
- Postgres + Prisma + migrations pipeline (migrate on deploy).
- Data-access layer pattern + tenant scoping helper (`org_id` / `user_id`).
- Redis, job queue worker process.
- Audit log module (partitioned table, append-only API).
- `apps/web` skeleton with routing, theme (light/dark), layout shell.
- `packages/types`, `packages/crypto` (empty, with test harness).

## Tasks

- [x] Root: pnpm workspace, Turborepo, `tsconfig.base.json`, Biome,
      `.gitignore` / `.gitattributes` (LF) / `.editorconfig` / `.nvmrc`
- [x] `docker-compose.yml`: Postgres 17 (:5433) + Redis 8 (:6380), `app_test` DB
- [x] CI: `.github/workflows/ci.yml` (lint, typecheck, test with Postgres, build)
- [x] api: env validation, pino logger with redaction, request IDs,
      error handling, `/health` + `/health/ready`, graceful shutdown
- [x] api: Prisma 7 + `prisma.config.ts`, single client module, writer/reader handles
- [x] api: tenant scoping helper (`db/tenant.ts`)
- [x] api: audit module (service + repository + public index)
- [x] api: init migration: partitioned `audit_log`, partition functions, append-only trigger
- [x] api: BullMQ worker process + daily partition job
- [x] api: tsup build (bundles `@repo/*`)
- [x] web: Vite + React + Tailwind 4, router, layout shell, light/dark/system theme, API status
- [x] `packages/types`: health, error, audit schemas
- [x] `packages/crypto`: format version + known-answer harness
- [x] Tests: types (audit action), api (app, redis, tenant, audit service,
      integration: partitions/scoping/append-only), web (theme), crypto (harness)
- [x] Docs: CLAUDE.md, ARCHITECTURE.md, decisions §8–§10, plan structure
- [ ] **User:** run the Verify steps below and paste any failures
- [ ] **User:** commit (including `pnpm-lock.yaml`) and push; confirm CI is green

## Done when

- `pnpm install`, `lint`, `typecheck`, `test`, `build` all pass locally.
- `pnpm db:migrate` applies `20261023000000_init` and does **not** ask
  to create a new migration (that would mean the hand-written SQL drifts
  from `schema.prisma`).
- `pnpm dev`: http://localhost:5173 shows the shell with "API ok" in the
  footer; the worker logs `worker started`.
- CI green on the first push.

## Verify (user runs, from the repo root, on the host)

```
npm install -g pnpm@12.15.0        (or: corepack enable)
pnpm install
copy apps\api\.env.example apps\api\.env
pnpm services:up
pnpm db:migrate
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm dev
```

- `pnpm install` may report ignored build scripts → run
  `pnpm approve-builds` and allow esbuild / prisma.
- `pnpm db:migrate`: if it prompts for a migration name, press Ctrl+C
  and paste the output (it means drift, which I'll fix in the SQL).
- `pnpm lint` failing on formatting only → `pnpm format` fixes it.
- Integration tests use `app_test`. It's created on the first
  `services:up`. If you had an older Postgres volume, run
  `pnpm services:down` then `docker volume rm monorepo-dev_pgdata`.

## Resume point

All code is written; nothing has been run yet. Next step: the user
runs Verify and pastes failures; fix them, then mark this phase Done in
the phase file and in `plan/README.md`. After that comes Phase 1 (accounts
& crypto core): create `plan/phase-01-accounts-crypto.md` from the
roadmap.
