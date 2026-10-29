# Phases 10–12: realtime sync, password health, import & export
Date: 2026-10-28

## Why
Finish the personal vault: changes show up live across browsers and API
instances (10), users see weak/reused/old passwords and get a full
generator page (11), and can move in from other managers and export (12).
Built together in one session at the user's request; verified by the user
2026-10-28 (typecheck, lint, tests, and every manual check in
ref/commands.md). The personal vault is complete.

## What changed
- apps/api/src/modules/realtime/: Redis pub/sub hub (one lazy subscriber per instance, ref-counted channels) + `GET /vault/events` SSE (ready / vault {revision} / heartbeat with non-sliding session re-check, 1 h lifetime, per-user caps)
- apps/api/src/modules/vault/vault.service.ts: `write()` helper publishes the revision after every commit (purge job too); `recordExport` + `POST /vault/exported`
- apps/api/src/modules/sessions/sessions.service.ts: `peek(tokenHash)` (liveness without sliding)
- apps/api/src/modules.ts, app.ts, server.ts, worker.ts: realtime wiring, optional logger / stream settings
- apps/api/test/integration/harness.ts: `addInstance()`, `cookieHeader()`; new realtime.test.ts
- apps/web/src/vault/live.ts + LiveIndicator: EventSource client, backoff, 60 s polling fallback
- apps/web/src/vault/health.ts, strength.ts (zxcvbn-ts, lazy), useHealth.ts; health filters in search.ts; dashboard card
- apps/web/src/components/GeneratorControls.tsx (shared with the popover), pages/generator/
- apps/web/src/vault/import/*, vault/export.ts, pages/settings/VaultData.tsx + vault/{Import,Export}Section.tsx
- packages/crypto/src/vaultExport.ts: account-bound encrypted export (AAD `vault-export:v1`)
- packages/types/src/vault.ts: `VaultExportedRequestSchema`

## Notes / gotchas
- Decisions: ref/decisions.md §19 (realtime), §20 (health), §21 (import/export).
- New deps: zxcvbn-ts (3 packages) and fflate in apps/web → `pnpm install`.
- Redis pub/sub ignores the DB number, so test and dev instances on the same Redis share channels (harmless: events carry only a revision).
- The CSV export uses Bitwarden's layout; hidden flags and password history don't survive CSV (the encrypted backup keeps everything).
