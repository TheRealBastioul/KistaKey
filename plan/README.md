# Phased Plan

Each phase ends with something usable and testable. Order follows
dependencies: crypto before vault, vault before orgs, orgs before
gated sharing. Phases 0–5 are the MVP; that's the point where the core
idea (vendor logs into Instagram via the vault and can't log in without
it) works end to end on the web + extension.

## How this folder works

- This file is the roadmap: one summary section per phase + the status
  table below. It stays short.
- When a phase starts, it gets its own `phase-NN-<slug>.md` with a task
  checklist, the decisions it depends on, and a "Done when" check. Tick
  tasks off as they land; don't delete them.
- New asks from `../START.md` get triaged into the right phase file (or
  a new phase) before any work starts, so nothing is built out of order.
- Decisions made along the way go into `../docs/decisions.md`.

## Status

| Phase | File | Status |
|---|---|---|
| 0 Foundation | `phase-00-foundation.md` | Scaffolded, awaiting local verification |
| 1 Accounts & crypto core | | Not started |
| 2 Personal vault | | Not started |
| 3 Organizations & lockboxes | | Not started |
| 4 Browser extension | | Not started |
| 5 Vault-gated access (MVP) | | Not started |
| 6 Cross-org vendor sharing | | Not started |
| 7 Mobile apps | | Not started |
| 8 Passkeys | | Not started |
| 9 Rotation & login adapters | | Not started |
| 10 Paid & enterprise | | Not started |

---

## Phase 0: Foundation

Goal: an empty but production-shaped monorepo.

- Monorepo (pnpm + Turborepo), TypeScript config, lint/format, CI.
- `apps/api` skeleton: Fastify, config, error handling, health check,
  structured logging, request IDs.
- Postgres + Prisma + migrations pipeline (migrate on deploy).
- Data-access layer pattern + tenant scoping helper (`org_id` / `user_id`).
- Redis, job queue worker process.
- Audit log module (partitioned table, append-only API).
- `apps/web` skeleton with routing, theme (light/dark), layout shell.
- `packages/types`, `packages/crypto` (empty, with test harness).

Done when: CI builds every app; API + worker + web run locally against
Postgres/Redis; one migration applies cleanly.

## Phase 1: Accounts & crypto core

Goal: users can sign up and sign in with zero-knowledge keys.

- `packages/crypto`: Argon2id KDF, item encryption, key wrapping, with
  known-answer tests (same output on every platform).
- Signup: master password → keys generated client-side; server gets
  auth hash + encrypted key material only.
- Login, lock/unlock, session cookies + CSRF, rate limits.
- MFA (TOTP + WebAuthn), trusted devices, device list + revoke.
- Account recovery kit at signup.
- Platform Terms / Privacy acceptance at signup (versioned, as in OrkaVault).
- Audit events for auth.

Done when: a user can sign up, log in on two browsers, and the DB holds
no readable key material.

## Phase 2: Personal vault

Goal: a usable personal password manager.

- Item types: Login, Secure Note, TOTP; custom fields; favorites.
- Folders (personal only).
- Client-side TOTP codes for personal items.
- QR: upload image + camera scan (web).
- Password generator; client-side health score + reuse detection.
- Realtime sync across sessions (SSE + Redis pub/sub).
- Import: CSV (+ Bitwarden / 1Password / LastPass formats), export.
- 3-pane vault UI.

Done when: create, edit, search, and sync items across two browsers; a
code generated from an uploaded QR matches a phone authenticator.

## Phase 3: Organizations & lockboxes

Goal: teams can share inside an org.

- Create org; free-tier limits (1 org, 10 users) enforced server-side.
- Invite by email → accept → key handoff (auto-confirm when an admin
  device is online; "waiting for confirmation" state).
- Roles: Owner, Admin, Manager, Sharer, Member.
- Lockboxes (working name): create, assign members/roles, item can be in
  several lockboxes.
- Permissions: **use** vs **reveal**, edit, share, manage.
- Share items with expiry; server-gated ciphertext delivery.
- Org sharing settings; org audit log view; Manage console (tiles + metrics).
- Clearance levels (optional per lockbox / item).
- Offboarding by end date (job).

Done when: an admin shares a login into a lockbox with use-only access
and the member's client never receives a "reveal" path; expiry removes
access on schedule.

## Phase 4: Browser extension

Goal: autofill works on real sites.

- Pairing + device key; unlock with master password / biometrics via
  the OS where possible.
- Personal autofill and save-new-login prompts.
- Use-only fill: exact origin match, fill + submit, deterrents (block
  copy/context menu, clear on type flip).
- QR capture from the current tab when enabling 2FA on a site.
- Audit every fill (user + device + item + origin).

Done when: logging into a test site with a use-only shared item works,
and a phishing-lookalike origin is refused.

## Phase 5: Vault-gated access ← the differentiator, MVP complete

Goal: a shared user can't log in without the vault.

- Server-custodied TOTP seeds (KMS, per-org keys); "convert to
  vault-gated" flow for an item (admin captures the 2FA QR).
- Grant service: per user + device + item, use/reveal, expiry, instant
  revoke (Redis-cached checks).
- Request / approve workflow (90s view, 24h, ongoing, use-only), "must
  use by" auto-expiry, notifications (in-app, email).
- Extension: fill password → fetch one TOTP code → submit.
- Approve / deny from Discord + Google Chat.
- Protection label per item (Strong / Basic) + nudge to gate sensitive ones.
- **External security review of the crypto + gated design before any
  public launch.**

Done when: a vendor logs into an Instagram test account through the
extension; after revoke, the same vendor with the extracted password can't
pass 2FA.

---

## Phase 6: Cross-org vendor sharing

- Share item / lockbox from org A to org B with ceiling (permission,
  expiry, re-share flag).
- Org B admins assign to their members, place in their lockboxes/folders.
- Org A: revoke all at once, per-user audit of B's usage.
- Vendor onboarding flow: invite link → signup → extension → first login
  in as few steps as possible.

## Phase 7: Mobile apps

- Expo app: vault, approvals (push), org management basics, QR scanning.
- iOS AutoFill Credential Provider extension (Swift).
- Android Autofill Service / Credential Manager (Kotlin).
- Gated items: native providers fetch TOTP codes from the API.

## Phase 8: Passkeys

- Passkey items; server-custodied private keys for gated passkeys
  (signing happens on the server, behind grants).
- Extension WebAuthn interception (registration + sign-in).
- Mobile passkey provider (iOS 17+, Android 14+).
- Personal (non-gated) passkeys stay ZK on the client.

## Phase 9: Rotation & login adapters

- Rotation schedules + reminders; rotate-on-revoke / on offboarding.
- Assisted rotation in the extension (open change-password page, fill
  old + generated new, save).
- Direct-POST login adapters for top sites (password never in the DOM).
- Adapter registry, versioned and updatable without an extension release.

## Phase 10: Paid & enterprise

- Billing: per-seat per org (Stripe), plan limits, upgrade flows.
- Custom roles / teams.
- Org-editable confidentiality banner / ToS / Privacy (versioned,
  re-acceptance; OrkaVault's content system).
- SSO (SAML / OIDC) + SCIM provisioning.
- Audit retention settings, export, backups.
- Later add-on: Google Workspace monitoring (OrkaVault feature set).
