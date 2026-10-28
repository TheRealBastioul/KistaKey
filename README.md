# (Product name TBD)

A credential manager with personal and org vaults. Shared users can only
log in through the app: revoke their access and they're locked out
instantly, even if they wrote the password down. See `ref/vision.md`.

## Prerequisites

- Node 24 (`.nvmrc`)
- pnpm 12: `npm install -g pnpm@12.15.0` (or `corepack enable`)
- Docker Desktop

## First run

```
pnpm install
copy apps\api\.env.example apps\api\.env      (macOS/Linux: cp)
pnpm services:up                              Postgres :5433, Redis :6380
pnpm db:migrate                               apply migrations
pnpm dev                                      API :3000, worker, web :5173
```

Open http://localhost:5173. The footer should say "API ok".

## Everyday commands

| Command | Does |
|---|---|
| `pnpm dev` | API + worker + web, with reload |
| `pnpm test` | All tests (integration tests use `TEST_DATABASE_URL`) |
| `pnpm typecheck` / `pnpm lint` / `pnpm build` | Same checks as CI |
| `pnpm format` | Auto-fix formatting + import order |
| `pnpm db:migrate` | After editing `apps/api/prisma/schema.prisma`: creates + applies a migration |
| `pnpm db:studio` | Browse the dev database |
| `pnpm services:down` | Stop Postgres/Redis (data kept in Docker volumes) |

## Where to look

- `ARCHITECTURE.md`: map of the code
- `plan/`: one folder per phase (detailed README each); finished phases in `plan/completed/`
- `ref/`: vision, features, decisions, target design, OrkaVault reference
- `CLAUDE.md`: working rules for Claude
