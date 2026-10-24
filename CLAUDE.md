# CLAUDE.md

Credential manager (personal + org vaults) whose core feature is shared
access that only works through the app: revoke and the user is locked
out, even if they wrote the password down. Product name not chosen yet.
Monorepo: `apps/{api,web,extension,mobile}`, `packages/{types,crypto}`.

## Environment: read before running anything

- I (Claude) work in a VirtualBox shared folder. **The user runs
  everything** on their Windows host: `pnpm install`, dev servers,
  Docker, tests, builds, migrations. I write the code, give the exact
  commands to run, and fix things from the output they paste back. I
  don't install packages, start servers, or run tests here.
- Exception: I can run **lint** myself. `node_modules` only has Windows
  binaries, so install a Linux Biome (same version as the root
  `package.json`) into the session scratchpad with
  `npm install --prefix <scratchpad>/biome @biomejs/biome@<version>` and run
  `<scratchpad>/biome/node_modules/.bin/biome check --config-path=<repo>/biome.json <repo>`.
  Run it before handing over Verify steps. Lint is the **only**
  exception: never run typecheck, tests, builds or the app here, even with
  a scratchpad copy. Hand those commands to the user.
- The user commits and pushes. I never commit.
- Shared-folder writes: write files **one at a time** (parallel writes
  collide). If Write/Edit fails with `ETXTBSY`, write the file to the
  scratchpad and `cp` it into place.
- Scripts must run in Windows cmd/PowerShell too: no `rm -rf`, no
  `VAR=x cmd` in package.json scripts, no bash-only syntax. Do
  cross-platform work in Node (see `apps/api/test/setup/`).

## Workflow

The user drives the work with four prompts:

### 1. "Read START.md" (plan and phase it)

1. Read `START.md`, `plan/README.md`, and the docs the tasks touch.
2. Triage every task: it goes into an existing phase, a new phase, or a
   decision the user has to make. Order phases by dependency so nothing
   has to be redone later.
3. Create/update `plan/phase-NN-<slug>.md` files (template below), with
   each task copied word for word under "Requested". Update the status
   table in `plan/README.md`. Record decisions in `docs/decisions.md`.
4. Clear `START.md` once every task is in a phase file, so it only ever
   holds untriaged work.
5. Reply with the phase breakdown and only the questions that block it.
   Don't ask about anything already decided in `docs/`. No code yet.

### 2. "Complete phase N"

1. Read `plan/phase-NN-*.md`, `ARCHITECTURE.md`, and only the docs that
   phase cites.
2. Build every task end to end without stopping. Make reasonable calls
   and list them in the summary. Ask only for real blockers (data loss,
   conflicting requirements).
3. Tick each task's checkbox as it lands. Record new decisions in
   `docs/decisions.md`.
4. Keep `ARCHITECTURE.md` in step with every new file, route, model, or
   job.
5. Finish with a **Verify** block of commands for the user to run. Phase
   status stays "Built, awaiting verification" until they paste
   results. Then fix failures and mark it Done.
6. Write the buildlog (`BUILDLOG.md` rules).

### 3. "Save context" (the user clears the session next)

1. Update the phase file: checkboxes, plus the "Resume point" section
   (exactly where work stopped and the next step).
2. Update the status table in `plan/README.md`.
3. Make `ARCHITECTURE.md` match the repo as it is now.
4. Write or update this session's buildlog in `buildlogs/`.
5. Save to memory only what the repo doesn't record (user preferences,
   corrections).
6. Reply with one line: what to say to resume, e.g. "complete phase 2".

### 4. New session

Read `plan/README.md`, the current phase file (its "Resume point"
first) and `ARCHITECTURE.md`. Don't re-read every doc. Read a doc only
when the task needs it.

### Phase file template

```markdown
# Phase NN: <Title>
Status: Not started | In progress | Built, awaiting verification | Done
Depends on: <phases>, decisions §<n>

## Goal
## Requested (verbatim from START.md)
## Tasks
- [ ] ...
## Done when
## Verify (user runs)
## Resume point
```

## Where things are

| File | What it is |
|---|---|
| `START.md` | User's untriaged tasks (plain text) |
| `plan/README.md` | Roadmap + phase status table |
| `plan/phase-NN-*.md` | The active phase's checklist and resume point |
| `ARCHITECTURE.md` | Map of the code as built, with diagrams. Check it before grepping |
| `docs/vision.md` | Product promise + security model |
| `docs/features.md` | Full feature list |
| `docs/decisions.md` | Decision log: append, never rewrite |
| `docs/design.md` | Target design (key hierarchy, grants, clients) |
| `docs/orkavault-carryover.md` | Which OrkaVault features to port and how |
| `ref/` | Predecessor app (OrkaVault) docs, read-only reference |
| `BUILDLOG.md`, `buildlogs/` | Buildlog rules, one entry per unit of work |

## Code rules

- **Layering:** route → module service → repository. Routes never touch
  Prisma. `PrismaClient` is constructed only in `apps/api/src/db/client.ts`.
  Repositories get `DbHandles` (`writer` / `reader`) and send replica-safe
  reads to `reader`.
- **Modules** (`apps/api/src/modules/<name>/`) talk to each other only
  through their `index.ts`.
- **Tenant scoping:** every query on tenant-owned data spreads
  `tenantWhere(tenant)` (`db/tenant.ts`). The tenant comes from the
  session, never from request input.
- **Zero-knowledge:** all client crypto lives in `packages/crypto`; no
  custom primitives. The server never receives plaintext secrets or keys,
  except gated TOTP seeds and passkey keys (KMS).
- **Authorization is server-side only.** Frontend checks are UX only.
- **Schema changes** always ship as a migration (`pnpm db:migrate`),
  never `db push`. SQL that Prisma can't model goes in the migration using
  Prisma's naming. Keep anything Prisma must ignore in the
  `audit_partitions` schema (or another schema outside `public`).
- **Audit:** security-relevant actions `await audit.record(...)`. If the
  audit write fails, the action fails. Never put secrets, ciphertext or
  field values in metadata or logs.
- **API contract** lives in `packages/types` (zod); API and clients both
  import it.
- **Errors:** throw the `AppError` helpers (`lib/errors.ts`). Unknown
  errors become a generic 500.
- **Tests:** Vitest, `*.test.ts` next to the code. DB tests go in
  `apps/api/test/integration/` against `TEST_DATABASE_URL`.
- **Naming:** package scope `@repo/*`; the display name comes only from
  `APP_NAME` (`apps/web/src/config.ts`).
- Format with Biome, and match the surrounding code.

## Commands (user runs from the repo root)

| Command | Does |
|---|---|
| `pnpm install` | Install everything |
| `pnpm services:up` / `services:down` | Start/stop Postgres (5433) + Redis (6380) |
| `pnpm db:migrate` | Create/apply migrations in dev |
| `pnpm db:deploy` | Apply migrations (deploy step) |
| `pnpm dev` | API :3000 + worker + web :5173 |
| `pnpm test` / `typecheck` / `lint` / `build` | What CI runs |
| `pnpm format` | Biome auto-fix |
