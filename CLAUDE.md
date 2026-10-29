# CLAUDE.md

Credential manager (personal + org vaults) whose core feature is shared
access that only works through the app: revoke and the user is locked
out, even if they wrote the password down. Product name not chosen yet.
Monorepo: `apps/{api,web,extension,mobile}`, `packages/{types,crypto}`.

## Environment: read before running anything

- I (Claude) work in a VirtualBox shared folder. **The user runs
  everything** on their Windows host: `pnpm install`, dev servers,
  Docker, tests, typecheck, builds, migrations. I write the code, give
  the exact commands, and fix things from the output they save to
  `ref/error.md`.
- Lint is the **only** exception. `node_modules` only has Windows
  binaries, so install a Linux Biome (same version as the root
  `package.json`) into the session scratchpad with
  `npm install --prefix <scratchpad>/biome @biomejs/biome@<version>` and run
  `<scratchpad>/biome/node_modules/.bin/biome check --config-path=<repo>/biome.json <repo>`.
  Run it before handing over Verify steps. Never run typecheck, tests,
  builds or the app here, even with a scratchpad copy.
- The user commits and pushes. I never commit.
- Shared-folder writes: write files **one at a time** (parallel writes
  collide). If Write/Edit fails with `ETXTBSY`, write the file to the
  scratchpad and `cp` it into place.
- Scripts must run in Windows cmd/PowerShell too: no `rm -rf`, no
  `VAR=x cmd` in package.json scripts, no bash-only syntax. Do
  cross-platform work in Node (see `apps/api/test/setup/`).
- Windows gotchas already hit: use `127.0.0.1`, not `localhost`, for
  Node-to-Node connections (IPv6 first); use `node --watch --import tsx`,
  not `tsx watch` (it hangs under Turborepo); never put two files in one
  folder whose names differ only by case (`markdown.ts` + `Markdown.tsx`:
  Windows resolved `./Markdown` to the `.ts` file).

## Phase size (hard rule)

**One phase = one Claude session of at most ~100k tokens.** There are no
sub-phases or sub-sessions, only phases. Keep each phase to one layer or
one feature slice: roughly 15–25 new or heavily edited files (e.g.
"crypto + contract", "API for X", "web pages for X"). When planning,
split any wider feature into several consecutive phases. If a phase
turns out bigger than planned while building, stop at a clean point,
save context, and split the remainder into a new phase right after it
(renumber the later phases and update `plan/README.md`).

## Workflow

The user drives the work with four prompts:

### 1. "Read START.md" (plan and phase it)

1. Read `START.md`, `plan/README.md`, and the phase READMEs and `ref/`
   docs the tasks touch.
2. Triage every task: it goes into an existing phase, a new phase, or a
   decision the user has to make. Order phases by dependency so nothing
   has to be redone later. Respect the phase size rule: add new phases
   rather than growing one past a session.
3. Update the phase folder READMEs (`plan/phase-NN-<slug>/README.md`):
   copy each task word for word under "Requested", then work it into the
   detailed task list. Create a new phase folder if needed (renumber the
   following phases). Update the status table in `plan/README.md`.
   Record decisions in `ref/decisions.md`.
4. Clear `START.md` once every task is in a phase README, so it only
   ever holds untriaged work.
5. Reply with the phase breakdown and only the questions that block it.
   Don't ask about anything already decided in `ref/`. No code yet.

### 2. "Complete phase N"

1. Read `plan/phase-NN-*/README.md` (Resume point first),
   `ARCHITECTURE.md`, and only the `ref/` docs that README cites.
2. First resolve the README's "Decisions at phase start" (record them in
   `ref/decisions.md`; ask only if one is the user's call). Then build
   every task end to end without stopping. Make reasonable calls and
   list them in the summary. Ask only for real blockers (data loss,
   conflicting requirements).
3. Tick each task's checkbox as it lands. Extra notes for the phase
   (design sketches, findings) go in the same folder.
4. Keep `ARCHITECTURE.md` in step with every new file, route, model, or
   job.
5. Finish with a **Verify** block of commands for the user to run, and
   write the same commands as a checkbox list in `ref/commands.md`
   (replace the previous phase's list). Tick boxes as the user reports
   each step passing. Status stays "Built, awaiting verification" until
   the user says it's verified.
6. **Errors:** the user saves output to `ref/error.md` and asks me to
   read it. Read the whole file every time; it's overwritten between
   runs. Before suggesting a fix, say which line shows the problem.
7. When the user says the phase is verified: set Status to Done, move
   the folder to `plan/completed/`, and update `plan/README.md`.
8. Write the buildlog (`BUILDLOG.md` rules).

### 3. "Save context" (the user clears the session next)

Also do this unprompted if a phase is running close to the session
limit (then split the rest into a new phase, see Phase size).

1. Update the current phase README: checkboxes, plus the "Resume point"
   section (exactly where work stopped, the next step, and anything
   decided that the next session must not redo).
2. Update the status table in `plan/README.md`.
3. Make `ARCHITECTURE.md` match the repo as it is now.
4. Write or update this session's buildlog in `buildlogs/`.
5. Save to memory only what the repo doesn't record (user preferences,
   corrections).
6. Reply with one line: what to say to resume, e.g. "complete phase 3".

### 4. New session

Read `plan/README.md`, the current phase README (its "Resume point"
first) and `ARCHITECTURE.md`. Don't re-read every doc. Read a `ref/` doc
only when the task needs it.

### Phase README structure

Every `plan/phase-NN-<slug>/README.md` has these sections. Keep them
detailed enough that the phase can be built from the README alone
(copy in the tables and endpoints it needs). Decisions shared by a run of
phases are listed in the first one; it records them in
`ref/decisions.md`, and the later phases cite that section:

`Status` · `Depends on` · `Goal` · `Requested (verbatim from START.md)` ·
`Scope` (in / out) · `Decisions at phase start` · `Data model` ·
`API` · `Clients` (web / extension / mobile) · `Jobs` ·
`Security requirements` · `Tasks` (checkboxes) · `Tests` ·
`Done when` · `Verify (user runs)` · `OrkaVault reference` ·
`Resume point`

Sections that don't apply say "None."

## Where things are

| Path | What it is |
|---|---|
| `START.md` | User's untriaged tasks (plain text) |
| `plan/README.md` | Phase index + status table + dependency order |
| `plan/phase-NN-<slug>/README.md` | One phase: detailed tasks, checklist, resume point |
| `plan/completed/` | Verified phases (moved here when done) |
| `ARCHITECTURE.md` | Map of the code as built, with diagrams. Check it before grepping |
| `ref/vision.md` | Product promise + security model |
| `ref/features.md` | Full feature list |
| `ref/decisions.md` | Decision log: append, never rewrite (§12 maps old → new phase numbers) |
| `ref/design.md` | Target design (key hierarchy, grants, clients) |
| `ref/orkavault-carryover.md` | Which OrkaVault features to port and how |
| `ref/OrkaVault-Architecture.md`, `ref/IDEA*.md` | Predecessor app map + original idea notes (read-only) |
| `ref/commands.md` | Current phase's Verify checklist for the user |
| `ref/error.md` | Latest error output from the user (overwritten each time) |
| `BUILDLOG.md`, `buildlogs/` | Buildlog rules, one entry per unit of work |

## Code rules

- **Layering:** route → module service → repository. Routes never touch
  Prisma. `PrismaClient` is constructed only in `apps/api/src/db/client.ts`.
  Repositories get `DbHandles` (`writer` / `reader`) and send replica-safe
  reads to `reader`.
- **Modules** (`apps/api/src/modules/<name>/`) talk to each other only
  through their `index.ts`. They're wired together in `src/modules.ts`.
- **Tenant scoping:** every query on tenant-owned data spreads
  `tenantWhere(tenant)` (`db/tenant.ts`). The tenant comes from the
  session (`request.auth.tenant`), never from request input.
- **Routes are locked by default:** the auth hook enforces every gate
  unless the route sets `config: { auth: "public" }` or
  `config: { auth: { allow: [...] } }`. Unsafe methods need the CSRF
  header unless `config: { csrf: false }`.
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
  `apps/api/test/integration/` against `TEST_DATABASE_URL` (+
  `TEST_REDIS_URL`).
- **Naming:** package scope `@repo/*`; the display name comes only from
  `APP_NAME` (`packages/types/src/brand.ts`, re-exported by
  `apps/web/src/config.ts`).
- Format with Biome, and match the surrounding code.

## Commands (user runs from the repo root)

| Command | Does |
|---|---|
| `pnpm install` | Install everything |
| `pnpm services:up` / `services:down` | Start/stop Postgres (5433) + Redis (6380) + Mailpit (SMTP 1025, UI 8025) |
| `pnpm db:migrate` | Create/apply migrations in dev |
| `pnpm db:deploy` | Apply migrations (deploy step) |
| `pnpm dev` | API :3000 + worker + web :5173 |
| `pnpm test` / `typecheck` / `lint` / `build` | What CI runs |
| `pnpm format` | Biome auto-fix |
