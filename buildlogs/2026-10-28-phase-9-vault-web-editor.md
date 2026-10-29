# Phase 9: vault web, item editor, generator & QR
Date: 2026-10-28

## Why
Users can now create and edit every item type on the web, generate
passwords inline and add TOTP from a QR code (upload or camera) or a
pasted key. Concurrent edits get a conflict dialog. Decisions §18.

## What changed
- packages/crypto/package.json (+ README): libsodium-free subpath exports `./generator`, `./otpauth`, `./totp`
- apps/web/package.json: `jsqr`
- apps/web/src/vault/editorModel.ts (+ test): draft ↔ ItemData, limits + blob size, password history, changed fields
- apps/web/src/vault/totpInput.ts (+ test): otpauth URI / bare key → TotpConfig, prefill
- apps/web/src/vault/qr.ts: image decode (jsQR), camera scan (BarcodeDetector / jsQR), stop
- apps/web/src/vault/useVault.ts: `createItem`, `updateItem`, `setFavorite`, `moveToFolder`, `ItemConflict`
- apps/web/src/pages/vault/editor/: `ItemEditor` (new/edit routes), `GeneratorPopover`, `TotpField`, `QrScanner`, `FieldLists`, `ConflictDialog`
- apps/web/src/components/Dialog.tsx, apps/web/src/lib/useDismiss.ts
- apps/web/src/pages/vault/: `ItemDetail` (Edit, star, folder picker), `Catalog` (New menu), `VaultPage`, `useVaultParams`; router `/vault/new`, `/vault/:itemId/edit`

## Notes / gotchas
- `Omit<TotpConfig, "secret">` would collapse to the loose schema's index
  signature, so `TotpSettings` is spelled out.
- The editor checks the item once at start: an item trashed elsewhere
  mid-edit keeps the form and hits the conflict dialog on save.
- `pnpm-lock.yaml` changed with `jsqr`; commit it with the phase.
- Verified by the user 2026-10-28.
