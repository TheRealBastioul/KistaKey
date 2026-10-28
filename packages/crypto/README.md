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

Phase 1 notes: the standard `libsodium-wrappers` build has no Argon2id,
so use `libsodium-wrappers-sumo`. React Native needs a native binding
(e.g. `react-native-libsodium`) behind the same interface.
