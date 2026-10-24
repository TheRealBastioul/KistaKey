# What Carries Over From OrkaVault

OrkaVault's own file map is in `../ref/OrkaVault-Architecture.md`.

OrkaVault is the predecessor app (internal credential vault, Express +
React + Postgres, server-side secret storage). This doc lists the
behaviour worth keeping, described on its own so it reads without the
OrkaVault codebase. Each item notes how it changes under the new app's
**zero-knowledge** model, since OrkaVault's server could read every secret
and the new app's server can't.

## Access workflow (the heart of OrkaVault)

| OrkaVault behaviour | In the new app |
|---|---|
| Users **request** access to a shared credential; Managers/Admins approve or deny | Keep. Works natively for vault-gated items (server-enforced). For ordinary ZK items, see "ZK + approvals" below |
| Request types: **view once for 90s**, **temporary 24h**, **ongoing** | Keep as grant durations. Add "use only (no reveal)" as an orthogonal permission |
| Approved grant has a **"must use by" deadline** (24h); unused grants auto-expire and the user must re-request | Keep (hourly job) |
| **Timed single-view reveal**: password shown for 90s, then hidden; auto-hide on click-away | Keep for "reveal" permission |
| Shared users get the **computed 6-digit TOTP code**, never the QR / seed; only Admins can see the raw QR | Becomes the vault-gated TOTP feature, the core differentiator |
| **Approve / deny from Discord and Google Chat** buttons, with the same checks as the web path | Keep. Fits vault-gated items directly |
| **Clearance levels**: a credential can require a minimum clearance tier, checked separately from role/scope | Keep as an optional lockbox/item policy |
| Managers are **scoped to the collections they manage**; checked server-side on every manager action | Keep. Becomes lockbox-level roles |
| **Offboarding by end date**: users auto-deactivated past their end date, grants revoked, admins notified | Keep. Very relevant for vendors (contract end dates) |
| Deactivation takes effect **immediately** (every request re-checks the user is active) | Keep |

## Credential entries

- Entry types: **Login**, **Secure Note** (type fixed after creation).
  New app adds **TOTP-only** and later **Passkey** entries.
- **Custom fields** (up to 20, label + secret value; labels visible, values
  only on reveal).
- **QR upload** for authenticator setup, decoded to validate it.
- **Bulk CSV import** with a downloadable template, plus a follow-up
  "QR codes pending" list.
- **Password health score** (weak/medium/strong) and rotation schedules
  with "rotation due in 7 days" notices. *ZK: scoring must run on the
  client, which reports only the score and never the password.*
- **QA approval** of new shared entries before use (optional org setting).
- Favorites; per-entry access history.

## Notifications

- In-app notifications with a **live push** (SSE) and polling fallback.
- Email notifications, rate-limited (1 per user per event type per hour).
- Fire-and-forget: a notification failure never blocks the action.
- *Scale note: OrkaVault's live push only works on a single server. The
  new app needs a shared pub/sub (Redis) so pushes reach users connected
  to any API instance.*

## Legal / consent (OrkaVault's latest phases)

- Admin-editable **Terms, Privacy, System-use notice, banners**, written in
  Markdown with draft → publish, an immutable version history, change
  notes and a diff view.
- **"Publish & require re-acceptance"** vs **"minor fix"**: a real change
  forces users through an acceptance gate on next request.
- Acceptance records per user per version (when, IP, how).
- Cookie-consent banner; sign-in notice banner.
- Safe Markdown renderer only (no raw HTML, link allowlist), since admin
  text is shown to everyone.
- *New app: platform-level legal docs from day one. Org-editable
  confidentiality banner / ToS / Privacy is a paid feature.*

## Audit

- Append-only audit log of every reveal, request, approval, edit, role
  change, and acceptance.
- Retention setting with automatic CSV backup before purge.
- *New app: every fill, TOTP code issued, and passkey signature is logged
  per user **and device**. The audit log lives in its own partitioned store.*

## Security patterns to keep

- Cookie-only auth tokens on web (httpOnly, never in localStorage or URLs)
  plus CSRF tokens on unsafe methods.
- Server-side authorization only; frontend role checks are UX.
- Rate limits keyed on the real client IP (right-most trusted
  X-Forwarded-For), not a spoofable header.
- MFA required; registered device keys to skip re-prompting on known devices.
- Strict CSP; Electron-style lockdown lessons apply to the extension.

## UX worth keeping

- 3-pane vault: catalog (filter/search) | selected item detail + actions |
  personal dashboard (alerts, favorites, recent requests).
- Manager/Admin console: tile grid + metrics, Vault/Manage toggle.
- "View as role" preview for admins (UI only).
- Light/dark theme.

## Enterprise extras (later, optional)

OrkaVault has Google Workspace monitoring: login/OAuth-grant activity feed
with alerts, connected third-party apps, device inventory, recovery-info
snapshot, and auto-creating vault entries per Workspace user. Useful as an
enterprise add-on, but not core to the password manager. Park it until
after launch.

## ZK + approvals: the one real design change

In OrkaVault the server could grant access by itself, because it held the
secrets. Under zero-knowledge it can't: someone's client has to encrypt
the item key for the new user. Approach:

- Lockbox keys are encrypted for each lockbox member when they join.
- The server additionally **gates delivery** of each item's ciphertext on
  an active grant (request/approve, expiry, use-only). So a Discord-button
  approval still works with no key operation at approval time.
- Honest limit: a user who was already granted an item could have cached
  its ciphertext. True revocation for ZK items means rotating the item
  (new password). This is exactly why vault-gated items exist for
  anything sensitive.
- New-member key handoff ("confirm member" in Bitwarden) needs an admin's
  client online once per new member. To keep onboarding low-friction,
  auto-confirm when any admin device next comes online, and show a
  "waiting for confirmation" state to the new member.
