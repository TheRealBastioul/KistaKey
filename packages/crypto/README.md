# @repo/crypto

The only place client-side cryptography is implemented. Web, extension
and mobile all use this package (mobile native modules run the same test
vectors).

Rules:

- **No custom crypto.** Compose vetted libsodium primitives only
  (Argon2id, XChaCha20-Poly1305 / AES-256-GCM, X25519 sealed boxes). See
  `ref/design.md` → Encryption model.
- **Every operation has known-answer vectors** in `test/vectors/`. A
  change that alters an output is a format change: bump
  `CRYPTO_FORMAT_VERSION` and keep the old vectors for decrypting old
  data.
- **Nothing here talks to the network or storage.** Pure functions in,
  bytes out.
- Every encrypted blob carries `CRYPTO_FORMAT_VERSION`.

Phase 6 notes: TOTP and the generator use WebCrypto (`crypto.subtle`
HMAC, `crypto.getRandomValues`) and don't need `ready()`. Item, folder and
TOTP vectors were generated outside this package (libsodium directly,
`node:crypto` HMAC, RFC 6238 table).

Phase 9 notes: `@repo/crypto/generator`, `@repo/crypto/otpauth` and
`@repo/crypto/totp` are subpath exports that never load libsodium, so a
UI thread can import them directly (the web app keeps everything else in
its crypto worker). Keep those files, and what they import, free of
`./sodium` imports.

Phase 1 notes: the standard `libsodium-wrappers` build has no Argon2id,
so use `libsodium-wrappers-sumo`. React Native needs a native binding
(e.g. `react-native-libsodium`) behind the same interface.
