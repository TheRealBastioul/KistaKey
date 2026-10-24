# Target Design

Built from the decisions in `decisions.md`. This is the *target* design;
`../ARCHITECTURE.md` maps what is actually built. The *(rec)* tech choices
were adopted in Phase 0 (see `decisions.md` §9).

## Repo layout (monorepo)

```
apps/
  api/          HTTP API + background workers
  web/          Web app (React + Vite + TypeScript + Tailwind)
  extension/    Browser extension, Manifest V3 (Chrome/Edge/Brave, Firefox later)
  mobile/       React Native (Expo) + native autofill/passkey modules
                  ios/   Swift: AutoFill Credential Provider extension
                  android/ Kotlin: Autofill Service / Credential Manager
packages/
  crypto/       ALL client crypto: key derivation, encrypt/decrypt, key wrapping
  types/        Shared API request/response types + validation schemas
  ui/           Shared React components (web + extension popup)
```

Tooling *(rec)*: pnpm workspaces + Turborepo. TypeScript everywhere
(including the web app, unlike OrkaVault's JSX) so `packages/types`
catches API drift at compile time.

## Backend

- **API** *(rec)*: Node + TypeScript, Fastify (Express-like, faster,
  built-in request schema validation). Structured as a **modular
  monolith**: one deployable, with internal modules by domain (auth,
  vault, orgs, lockboxes, sharing, grants, gated-secrets, audit,
  notifications, billing). Modules only talk through their public
  functions, so one can later be split out as its own service if needed.
- **Database**: PostgreSQL. ORM *(rec)*: Prisma (familiar). Versioned
  migrations committed to git, applied automatically on deploy.
- **Data layer rule**: routes never query the DB directly. They call
  module services, which use a data-access layer. That's what makes
  "send reads to a replica" a config change later.
- **Redis**: sessions/token revocation cache, rate limits, pub/sub for
  live push across API instances.
- **Job queue** *(rec: BullMQ on Redis)*: emails, push notifications,
  grant expiry, offboarding, rotation reminders, audit export.
- **KMS** (cloud KMS / HSM): wraps the server-custodied secrets (gated
  TOTP seeds, passkey private keys). Per-org data keys (envelope
  encryption), so one org's keys can be rotated or destroyed independently.
- **Realtime**: SSE (or websockets) for vault sync and notifications,
  fanned out via Redis pub/sub.

### Scaling path (only when needed)

1. Start: 1 Postgres primary, N stateless API instances behind a load
   balancer, 1 Redis, workers as a separate process type.
2. Read load grows → add Postgres **read replicas**. Data layer routes
   read-only queries there.
3. Audit volume grows → audit already in its own partitioned table (by
   month). Move to a separate database if needed.
4. Gated-secret / grant traffic grows → split that module into its own
   service (it's the hot path for every vendor login).

Every tenant-owned table has an `org_id` (or `user_id` for personal data)
and every query is scoped by it from day one. Consider Postgres row-level
security as a second safety net.

## Encryption model (decided: zero-knowledge, except gated secrets)

### Key hierarchy

```
Master password ──Argon2id──► Master key  (never leaves device)
                                  │
                                  ├─ derives auth hash ──► sent to server for login
                                  │                         (server hashes it again)
                                  └─ decrypts ──► User symmetric key
                                                     │
                       User keypair (X25519) ◄───────┤ private key encrypted with user key
                                                     │
                       Personal items ◄──────────────┘ each item has its own key, wrapped by user key

Org key / Lockbox key ── wrapped to each member's public key
   └─ wraps item keys for items in that lockbox
```

- Algorithms *(rec)*: Argon2id (KDF), XChaCha20-Poly1305 or AES-256-GCM
  (items), X25519 sealed boxes (wrapping keys for other users), via
  libsodium. **No custom crypto.** Everything lives in `packages/crypto`,
  used identically by web, extension, and mobile.
- Server stores only ciphertext + wrapped keys + metadata it needs
  (names may be encrypted too; decide per field in Phase 1).
- **Account recovery** (must design in Phase 1): recovery key / kit shown
  at signup, plus optional org admin recovery (org can re-wrap a member's
  key, opt-in at join; Bitwarden calls this "account recovery").

### Vault-gated secrets (the exception)

- TOTP seeds and passkey private keys for gated items are encrypted with a
  **KMS-wrapped per-org key on the server**. The server can use them; it
  never sends them to clients.
- The server issues one TOTP code / one passkey signature per request, only
  if the caller has an active grant for that item on a paired device.
  Every issue is audit-logged.
- The gated item's password itself stays ZK like any other item.

## Grant service (core of the differentiator)

A grant = (user, device, item, permission [use | reveal], expiry, source
[request / direct share / cross-org]).

- Created by approvals, shares, cross-org assignments.
- Checked on: ciphertext delivery, TOTP code issue, passkey signing, fill.
- Revocation is immediate (Redis cache invalidated on revoke).
- Cross-org grants carry a ceiling from the sharing org: the receiving org
  can narrow but never widen permission or expiry.

## Clients

### Web
React + Vite + TS + Tailwind. Cookie-only session + CSRF (OrkaVault
pattern). Vault decrypted in memory only; lock after inactivity.

### Extension
- MV3 *(rec: WXT framework for cross-browser builds)*.
- Pairs with the account on install. Device keypair; device listed in
  the user's device list, revocable.
- Fill only on exact top-level origin match over HTTPS.
- Use-only items: fill + submit, block copy/context menu, clear on type
  flip. Direct-POST adapters for top sites (later phase).
- Requests TOTP codes / passkey signatures from the API for gated items.
- WebAuthn interception for passkey provider support.

### Mobile
- Expo React Native app: vault, approvals, notifications (push).
- Native autofill providers (Swift / Kotlin) call into the shared crypto
  through a bridge, and into the API for gated codes.
- Passkey provider on iOS 17+ / Android 14+.

## Auth

- Login = email + master-password-derived auth hash. MFA required (TOTP
  or WebAuthn). Optional later: SSO for enterprise (unlock still needs
  the master password or a trusted-device key, as in Bitwarden).
- Sessions: web uses httpOnly cookies; extension and mobile use
  device-bound refresh tokens.
- Every request re-checks user active state (cached in Redis with
  invalidation on deactivate).
