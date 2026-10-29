# Phased Plan

Each phase ends with something usable and testable, and is **small enough
to build in one Claude session (~100k tokens)**: roughly 15–25 new or
heavily edited files, one layer or one feature slice. Order follows
dependencies. Phases 1–28 are the MVP: that's the point where the core
idea (vendor logs into Instagram via the vault and can't log in without
it) works end to end on the web + extension.

## How this folder works

- One **folder per phase**: `phase-NN-<slug>/README.md` holds the full
  detail for that phase (goal, scope, decisions, data model, API,
  clients, jobs, security, task checklist, tests, done-when, verify,
  resume point). Extra notes for a phase (threat model, spike findings)
  go in the same folder.
- A phase that turns out too big for one session is split into two
  phases (renumber the ones after it), never into sub-phases.
- When the user verifies a phase, its folder moves to `completed/`.
- New asks from `../START.md` are triaged into the right phase README
  (or a new phase folder) before any work starts, so nothing is built
  out of order.
- Decisions made along the way go into `../ref/decisions.md`.
- Phases were renumbered on 2026-10-28 (decisions §12 maps old → new).

## Status

| Phase | Folder | Status |
|---|---|---|
| 0 Foundation | `completed/phase-00-foundation/` | Done |
| **Accounts** | | |
| 1 Crypto core & API contract | `completed/phase-01-crypto-core/` | Done |
| 2 Auth API | `completed/phase-02-auth-api/` | Done |
| 3 Web auth core | `completed/phase-03-web-auth-core/` | Done |
| 4 Web MFA & account recovery | `completed/phase-04-web-mfa-recovery/` | Done |
| 5 Web security settings & legal | `completed/phase-05-web-security-legal/` | Done |
| **Personal vault** | | |
| 6 Vault crypto & contract | `completed/phase-06-vault-crypto-contract/` | Done |
| 7 Vault API | `completed/phase-07-vault-api/` | Done |
| 8 Vault web: store & browsing | `completed/phase-08-vault-web-browse/` | Done |
| 9 Vault web: editor, generator & QR | `completed/phase-09-vault-web-editor/` | Done |
| 10 Realtime vault sync | `completed/phase-10-vault-realtime/` | Done |
| 11 Password health & generator page | `completed/phase-11-vault-health-generator/` | Done |
| 12 Vault import & export | `completed/phase-12-vault-import-export/` | Done |
| **Organizations & lockboxes** | | |
| 13 Org crypto & contract | `phase-13-org-crypto-contract/` | Not started |
| 14 Orgs & members API | `phase-14-orgs-members-api/` | Not started |
| 15 Lockboxes, shares & org sync API | `phase-15-lockboxes-shares-api/` | Not started |
| 16 Orgs web | `phase-16-orgs-web/` | Not started |
| 17 Lockboxes & sharing web | `phase-17-lockboxes-sharing-web/` | Not started |
| 18 Manage console & org audit | `phase-18-manage-console-audit/` | Not started |
| 19 Org admin account recovery (optional) | `phase-19-org-account-recovery/` | Not started |
| **Browser extension** | | |
| 20 Extension foundation & device auth | `phase-20-extension-foundation/` | Not started |
| 21 Extension autofill | `phase-21-extension-autofill/` | Not started |
| 22 Use-only fill, QR capture & e2e | `phase-22-extension-use-only-qr/` | Not started |
| 23 Extension biometric unlock (optional) | `phase-23-extension-biometric-unlock/` | Not started |
| **Vault-gated access** | | |
| 24 KMS & gated secrets | `phase-24-kms-gated-secrets/` | Not started |
| 25 Grants & gated login | `phase-25-grants-gated-login/` | Not started |
| 26 Access requests, approvals & notifications | `phase-26-access-requests-notifications/` | Not started |
| 27 Chat approvals | `phase-27-chat-approvals/` | Not started |
| 28 Threat model & security review (MVP complete) | `phase-28-security-review/` | Not started |
| **Cross-org sharing** | | |
| 29 Cross-org shares API | `phase-29-org-shares-api/` | Not started |
| 30 Cross-org sharing web & vendor onboarding | `phase-30-org-shares-web-onboarding/` | Not started |
| **Mobile** | | |
| 31 Mobile foundation | `phase-31-mobile-foundation/` | Not started |
| 32 Mobile vault, approvals & push | `phase-32-mobile-vault-approvals/` | Not started |
| 33 iOS AutoFill provider | `phase-33-ios-autofill/` | Not started |
| 34 Android autofill provider | `phase-34-android-autofill/` | Not started |
| **Passkeys** | | |
| 35 Passkey items & gated passkey API | `phase-35-passkey-core-gated-api/` | Not started |
| 36 Extension passkeys | `phase-36-extension-passkeys/` | Not started |
| 37 Mobile passkey providers | `phase-37-mobile-passkeys/` | Not started |
| **Rotation & login adapters** | | |
| 38 Direct-POST login spike | `phase-38-direct-post-spike/` | Not started |
| 39 Rotation schedules & tasks | `phase-39-rotation-tasks/` | Not started |
| 40 Assisted rotation in the extension | `phase-40-assisted-rotation/` | Not started |
| 41 Direct-POST login adapters | `phase-41-login-adapters/` | Not started |
| **Paid & enterprise** | | |
| 42 Billing & entitlements | `phase-42-billing/` | Not started |
| 43 Custom roles & teams | `phase-43-custom-roles-teams/` | Not started |
| 44 Org content & confidentiality gate | `phase-44-org-content/` | Not started |
| 45 SSO (SAML & OIDC) | `phase-45-sso/` | Not started |
| 46 SCIM provisioning | `phase-46-scim/` | Not started |
| 47 Audit retention & export | `phase-47-audit-retention/` | Not started |

## Dependency order

```
0 → 1–5 (accounts) → 6–12 (vault) → 13–19 (orgs) → 20–23 (extension)
  → 24–28 (vault-gated, MVP) → 29–30 (cross-org)
                              └→ 31–34 (mobile) → 35–37 (passkeys)
  22 → 38 (spike, any time after 22)
  30 → 39 → 40 → 41 (41 also needs 38)
  18 → 42 → 43–47 (billing can start any time after 18)
```
