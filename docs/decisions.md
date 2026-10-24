# Decision Log

Every product/architecture decision, with the recommendation and the
recorded answer. Add new decisions at the bottom as numbered sections;
never delete one, mark it superseded instead.

## 1. Encryption model  ← decide first, everything depends on it

- **Zero-knowledge (Bitwarden):** items encrypted client-side; server
  can't read them. Org keys wrapped per member. Losing the master password
  can mean losing data.
- **Server-side (OrkaVault today):** server decrypts via KMS. Simpler,
  recoverable, but a server breach is worse and it's a harder sell to
  security buyers.
- **Hybrid (recommended):** personal vault + ordinary shared items are
  zero-knowledge. "Vault-gated" items (server-held TOTP seeds, passkey
  private keys) are server-custodied in KMS/HSM — they *must* be, because
  the server has to issue codes / signatures. Clearly labelled in the UI.

Decision: _ Bitwarden level.

Recorded (CONFIRMED): zero-knowledge by default, Bitwarden-level,
for every vault item. Only exception: the server-held TOTP seeds and
passkey private keys of "vault-gated" items, which the core feature can't
work without. Effectively the hybrid model, with ZK as the default
everywhere else. Needs an account-recovery design (Phase 1).

## 2. Pricing model

Idea says paid = up to 5 orgs with unlimited users. A flat fee for
unlimited users means a 5,000-seat enterprise pays the same as a 3-person
agency. Recommend per-seat pricing for paid org tiers, with the free tier
as stated.

Decision: _ fine we can do unlimited orgs, pay per seat in each org

Recorded: free tier = 1 org, max 10 users. Paid = unlimited orgs, billed
per seat per org.

## 3. Folders vs collections

Can an item live in multiple folders? Can folders nest? Bitwarden separates
personal *folders* (organisation only) from org *collections* (permission
boundary, item can be in several). Recommend: same split, permissions only
on collections, single-level to start.

Decision: _ yea lets split them, lets name them something to seperate us from a bitwarden branding, lets keep folders, but change collections to "lock boxes" or something original, that will fit with our branding (not sure what we will call it yet, im open to original ideas)

Recorded: split. **Folders** = personal organisation, no permissions.
Org permission containers get an original name, working name **"Lockbox"**
until branding is picked. Single-level, and an item can be in several.
Names already used by competitors (avoid): Collections (Bitwarden),
Vaults (1Password), Safes (CyberArk), Shared Folders (LastPass/Keeper).

## 4. Cross-org sharing shape

When org A shares with vendor org B: does org B's admin re-share
internally, or does A pick individual people at B? Recommend: A shares to
org B with a cap and expiry; B's admins assign within that; A can revoke
everything at once and sees B's per-user audit.

Decision: _Yes, have Org B's admin assign the other orgs cred, also we can add this cred to collections/folder if needed.

Recorded: org A shares to org B with a cap + expiry. B's admins assign it
to people and can place it in B's lockboxes/folders. B can never exceed
A's grant: no "reveal" if A set use-only, no extending expiry, and no
re-sharing to a third org unless A allows it. A can revoke everything at
once and sees B's per-user audit.

## 5. Mobile stack

React Native (Expo) shares language/logic with the React web app, but the
autofill / passkey providers must be native extensions (Swift / Kotlin)
either way. Recommend React Native + native provider modules, with the
crypto in one shared library used by web, extension, and mobile.

Decision: _ Kotlin, I guess

Recorded (CONFIRMED): React Native (Expo) for the app. Small native
modules for autofill + passkey providers: Swift (iOS AutoFill Credential
Provider extension) and Kotlin (Android Autofill Service / Credential
Manager). Crypto comes from the shared `packages/crypto`.

## 6. Repo / codebase shape

New app is a separate project. Recommend a monorepo (web, extension,
mobile, api, shared crypto + types packages) so the client crypto and API
types can't drift between four clients.

Decision: _ yes monorepo

Recorded: monorepo: apps/{web,extension,mobile,api}, packages/{crypto,types}.

## 7. Scale assumptions (500k+ users)

Not exotic: Postgres + stateless API horizontally scaled + Redis + a job
queue covers it. Main design points: `org_id` on every row (multi-tenant
from day one), audit log in a partitioned / separate store (fastest-growing
table), realtime vault sync (SSE / websockets), per-tenant envelope
encryption keys. Avoid microservices until a component actually needs to
scale independently (likely candidates: grant/code service, audit).

Decision: _ sure i don't really know much about scaling so i will just assume you know best lol. I just want to make sure it's easy and built in a way we can easily migrate / add tables etc, i know we may need to dupe data bases to make read data bases, and make seperate write db or something like that i heard idk lol

Recorded: follow the recommendation above, plus:
- Versioned migrations from day one (every schema change is a migration
  file in git, applied automatically on deploy).
- All DB access goes through a data layer, never raw queries in routes.
  Sending reads to a read replica later is then a config change, not a
  rewrite.
- Start with one Postgres primary. Add read replicas when load needs them.
  No separate write/read architecture (CQRS) up front.

## 8. Product name

Open. "Lockbox" (the project folder) is not the name. Brainstorm in
progress; check trademark + domain + app-store availability before
deciding.

Recorded (interim): code uses the neutral package scope `@repo/*` and a
single display-name constant (`apps/web/src/config.ts` `APP_NAME`), so the
rename is a one-line change plus docs. The org permission container keeps
the working name "Lockbox" until the product name is picked, since the two
should fit together.

## 9. Phase 0 tooling

Recorded (2026-10-23): the *(rec)* stack in `design.md`, as-is: pnpm
workspaces + Turborepo, TypeScript everywhere, Fastify, Prisma 7 +
PostgreSQL 17, Redis + BullMQ, React + Vite + Tailwind, WXT (Phase 4).
Additions not covered by the design doc:
- Lint/format: **Biome** (one tool, replaces ESLint + Prettier).
- Tests: **Vitest** in every package.
- API build: **tsup** bundles `apps/api` (incl. the `@repo/*` source
  packages) to `dist/`. Internal packages ship TypeScript source, no build.
- Local services: `docker-compose.yml` (Postgres on 5433, Redis on 6380,
  so they don't clash with OrkaVault's on the default ports).
- CI: GitHub Actions.
- Versions pinned to latest stable majors on 2026-10-23, except BullMQ 5 /
  ioredis 5 (BullMQ 6 changed its Redis client model; revisit later) and
  Prisma 7 (8 is still a release candidate).

## 10. Audit log storage

Recorded (2026-10-23): one `audit_log` table, range-partitioned by month
on `occurred_at`. Partitions live in a separate `audit_partitions`
Postgres schema so Prisma (which manages only `public`) never tries to
drop them. A worker job creates partitions 3 months ahead, daily
(idempotent). A trigger rejects UPDATE/DELETE, so the table is
append-only at the database level. Retention (later) = detach + drop
whole partitions.
