# Commands to run (Phase 0 verification)

Run from the repo root on your machine, in order. Tick each box as it
passes. If a step fails, save its output to `ref/error.md` and tell Claude:

```
<command> > ref\error.md 2>&1
```

## Setup (once)

- [x] `npm install -g pnpm@12.15.0`
- [x] `pnpm install`
  - If it complains about build scripts (`set this to true or false` in
    `pnpm-workspace.yaml`), tell Claude which package.
- [x] `copy apps\api\.env.example apps\api\.env`
- [x] **Start Docker Desktop** and wait until it says "Engine running"
      (`docker info` should print without errors)
- [x] `pnpm services:up`: starts Postgres (5433) + Redis (6380) in Docker
- [ ] `pnpm db:migrate`: applies the first migration
  - If it **asks for a migration name**, press Ctrl+C and save the output
    (that means the schema and the migration don't match).

## Checks (same as CI)

- [ ] `pnpm lint`. If it only fails on formatting, run `pnpm format`,
      then `pnpm lint` again.
- [ ] `pnpm typecheck`
- [ ] `pnpm test`
- [ ] `pnpm build`

## Run it

- [x] `pnpm dev`, then open http://localhost:5173
  - Footer should say **API ok**
  - Terminal should show `worker started`
  - Theme toggle (Light / System / Dark) should switch colors
- Stop with Ctrl+C.

## After everything passes

- [ ] Commit everything, **including `pnpm-lock.yaml`**, and push
- [ ] Check the GitHub Actions CI run is green
- [ ] Tell Claude "Phase 0 verified"
