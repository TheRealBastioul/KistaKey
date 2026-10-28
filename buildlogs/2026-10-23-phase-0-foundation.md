# Phase 0 foundation scaffold
Date: 2026-10-23

## Why
Phase 0 of `plan/README.md`: a production-shaped, empty monorepo, so
Phase 1+ can be built without reworking infrastructure.

## What changed
- Root: pnpm workspace + Turborepo + Biome + shared tsconfig, docker-compose (PG 17 :5433, Redis 8 :6380), CI workflow
- apps/api: Fastify app factory (`app.ts`), env validation, logger, errors, health routes, Prisma 7 client module (writer/reader), tenant helper, audit module, BullMQ worker + partition job, tsup build
- apps/api/prisma: `AuditLog` model + hand-written init migration (monthly partitions in `audit_partitions` schema, append-only trigger)
- apps/web: Vite/React/Tailwind shell, router, light/dark/system theme, API status
- packages/types, packages/crypto: shared schemas; crypto format version + known-answer harness
- Docs: `Start-here/` split into `docs/` + `plan/`; CLAUDE.md rewritten around the START → plan → phase → save-context loop; ARCHITECTURE.md as-built map; decisions §8–§10

## Notes / gotchas
- Verified by the user on the Windows host (install, migrate, lint, typecheck, test, build, dev, CI). Verify steps: `plan/completed/phase-00-foundation/README.md`.
- Docs later reorganized: reference docs now in `ref/`, one folder per phase in `plan/`.
- Pinned BullMQ 5 / ioredis 5 (BullMQ 6 changed its Redis client model) and Prisma 7 (8 is RC).
- `pnpm db:migrate` must not propose a new migration; if it does, the hand-written SQL drifted from `schema.prisma`.
- pnpm 12 blocks unlisted install scripts and writes a placeholder into `allowBuilds`; `msgpackr-extract` (BullMQ) had to be added.
- Windows host fixes: Vite proxy targets `127.0.0.1` (Node resolves `localhost` to `::1` first); api dev scripts use `node --watch --import tsx` because `tsx watch` hung silently under `turbo run dev` (plain `tsx` worked).
- Biome 2.6 formats Markdown and YAML: `*.md` and `pnpm-lock.yaml` are excluded in `biome.json`. `rules.recommended` is now `rules.preset`.
- Product name undecided: scope `@repo/*`, display name `APP_NAME`.
