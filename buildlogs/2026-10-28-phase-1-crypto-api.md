# Phases 1–2 built (crypto core, auth API) + plan re-split
Date: 2026-10-28

## Why
Accounts & zero-knowledge crypto. Built Phase 1 (crypto core & contract)
and Phase 2 (auth API), started Phase 3 (web auth core). The session ran
far past the context budget, so the user had the whole plan re-split
into small phases (one ~100k-token session each). Not yet
typechecked/tested on the host.

## What changed
- packages/crypto: libsodium Argon2id, WebCrypto HKDF, XChaCha20-Poly1305 blobs, key wrap, X25519 sealed boxes, recovery key (Crockford base32), account flows; known-answer vectors + tests
- packages/types: auth, MFA, devices, legal, common schemas; gate error codes; `brand.ts` APP_NAME
- apps/api: Phase 2 Prisma models; env (APP_ORIGIN, SERVER_*_KEY, MAIL_*); lib secrets/TOTP/http; plugins auth (gates), CSRF, rate limit; modules users, sessions, devices, legal, email, mfa, auth; `src/modules.ts` composition root; worker email queue + auth.cleanup; integration tests
- docker-compose: Mailpit; CI: Redis service + TEST_REDIS_URL
- apps/web: deps, worker format, config, API client + typed endpoints (rest of Phase 3 pending)
- plan/: 10 phases → 47 small phases (old folders removed); decisions §11 (Phase 1–2 decisions) and §12 (phase size rule + old → new mapping); CLAUDE.md phase-size rule; `ref/commands.md` Verify list for Phases 1–2

## Notes / gotchas
- libsodium Argon2id has no parallelism setting → p=1 (decisions §11.2); libsodium.js has no HKDF → WebCrypto.
- Server Argon2id uses Node's built-in `crypto.argon2` → Node ≥ 24.7 (root `engines` bumped).
- Migration not written by hand: user runs `pnpm db:migrate --name accounts_auth`.
- `@fastify/rate-limit` runs only one of its own hooks per request; multi-key limits use `app.createRateLimit`.
- Legal docs are TS modules (bundled by tsup); a seeded version's text must never change (API refuses to start).
- Vectors were generated in a scratchpad script with libsodium and cross-checked against Node crypto.
- Shared-folder writes hit ETXTBSY repeatedly on CLAUDE.md, ARCHITECTURE.md, docker-compose.yml.
