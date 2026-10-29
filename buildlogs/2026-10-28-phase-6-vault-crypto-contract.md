# Phase 6: vault crypto & contract
Date: 2026-10-28

## Why
First personal-vault phase: the client-side building blocks every vault
client shares (item encryption, TOTP, otpauth parsing, generator) and the
API contract Phase 7 implements. Decisions §15.

## What changed
- packages/crypto/src/items.ts: per-item keys wrapped by the user key; item JSON under the item key; folder names; `rewrapItemKey` for Phase 13; item/folder id bound as AAD with distinct labels
- packages/crypto/src/keys.ts: optional `aad` on `wrapKey` / `unwrapKey`
- packages/crypto/src/totp.ts: RFC 6238 (WebCrypto HMAC SHA1/256/512), base32 secrets, limits
- packages/crypto/src/otpauth.ts: hand-written `otpauth://totp` parser + formatter
- packages/crypto/src/generator.ts, wordlist.ts: unbiased password / passphrase generator, EFF long list (7,776 words)
- packages/crypto/test/known-answer.test.ts + vectors: `item.decrypt`, `folder.decrypt_name`, `totp.code` (RFC 6238 table, all three hashes)
- packages/types/src/vault.ts: `VAULT_LIMITS`, decrypted `ItemDataSchema`, wire item/folder/sync/batch schemas; common.ts exports `ENCRYPTED_BLOB_PATTERN`

## Notes / gotchas
- Vectors were generated independently in a scratchpad script (libsodium
  directly + `node:crypto` HMAC, RFC 6238 table asserted), not by our code.
  Never regenerate them to make a test pass.
- Item ids are client-picked because they're bound into the ciphertext;
  Phase 7 must reject an id that's already taken.
- `ItemDataSchema` is loose (unknown fields survive older clients' edits);
  vault limits may only grow.
- Verified by the user 2026-10-28.
