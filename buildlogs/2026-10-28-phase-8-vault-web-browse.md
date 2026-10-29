# Phase 8: vault web, store & browsing
Date: 2026-10-28

## Why
First vault UI: the web app syncs the personal vault, decrypts it in the
crypto worker and lets the user browse, search, filter, reveal/copy, see
TOTP codes, manage folders and use the trash. Decisions §17.

## What changed
- apps/web/src/crypto/worker.ts: vault ops `decryptItems`, `decryptFolders` (per-entry failure), `encryptItem`, `encryptFolderName`, `totpCode`
- apps/web/src/api/client.ts: `PUT`; apps/web/src/api/vault.ts: `vaultApi`
- apps/web/src/vault/: `store.ts` (sync engine + in-memory vault, injected deps), `search.ts` (index, filters, counts), `useVault.ts` (singleton, lock wiring, actions), `clipboard.ts`, `useReveal.ts`, `useTotp.ts`, `devSeed.ts`; tests `store.test.ts`, `search.test.ts`
- apps/web/src/pages/vault/: `VaultPage` (3 panes), `Sidebar`, `Catalog`, `ItemDetail` (+ `ItemRoute`), `FieldRow`, `Dashboard`, `useVaultParams`
- apps/web/src/router.tsx: `/vault` (Dashboard) and `/vault/:itemId`

## Notes / gotchas
- No IndexedDB cache: every unlock does a full sync.
- Every write is followed by a sync instead of patching the store.
- TOTP runs in the worker so the main thread never loads libsodium.
- "Add sample items" only exists under `vite dev`.
- Typecheck caught TS2454 in `store.ts`: a const read inside the async IIFE
  that initializes it (TS flow-analyses IIFEs). The cleanup now runs in
  `.finally()` on `loop(gen)`.
- Verified by the user 2026-10-28.
