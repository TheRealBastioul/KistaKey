# Phases 1–2 verified (typecheck fixes)
Date: 2026-10-28

## Why
The user ran the Phase 1–2 Verify checklist on the host. Two typecheck
failures had to be fixed before everything passed. Both phases are now
verified and moved to `plan/completed/`.

## What changed
- packages/crypto/test/known-answer.test.ts: vector `input`/`expected` typed as `Partial<Record<string, string>>` (the JSON import unions every case's fields, so missing ones come through as `undefined`)
- apps/api/test/integration/auth.test.ts: `SLOW` is now `60_000`; Vitest 5 only accepts a number as the third `it()` argument, not `{ timeout }`
- ref/commands.md: added a `pnpm db:generate` step before the API typecheck
- plan/: phases 1 and 2 → Done, moved to `plan/completed/`; ARCHITECTURE.md status line updated

## Notes / gotchas
- `pnpm --filter <pkg> …` skips Turbo, so it skips the `db:generate` dependency in `turbo.json`. Prisma 7's `migrate dev` doesn't regenerate the client either. After any schema change, Verify lists that use `--filter` need `pnpm db:generate` first.
- Vitest 5: to pass options, use `it(name, { timeout }, fn)`; to put the timeout last, use `it(name, fn, ms)`.
