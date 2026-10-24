# Feature Breakdown

Notes in *italics* are design implications to resolve; decisions live in
`decisions.md`.

## Users

- Create organizations — free: 1 org, max 10 users; paid: up to 5 orgs,
  unlimited users. *See pricing question in 02.*
- Personal vault: logins, 2FA (TOTP) entries, secure notes.
- Folders to group entries.
- Share credentials with expiry.
- Share 2FA codes; add TOTP by uploading or scanning a QR code.
- Scan QR codes (web: camera or image upload; mobile: native camera;
  extension: decode a QR shown in the current tab).

## Organizations

- Invite members (email link; must stay low-friction for vendors).
- Built-in roles: Owner, Admin, Manager, Sharer (+ plain Member).
- Custom roles / teams — paid.
- Share creds / 2FA with members, teams, and **other organizations**
  (vendor sharing).
- Lockboxes (working name; org permission containers) with their own role
  assignments and editable permission settings. Folders stay personal-only.
- Org-wide sharing settings (e.g. "external sharing allowed", max share
  duration, require approval).
- Editable confidentiality banner / ToS / Privacy — paid (OrkaVault feature).
- Audit log of all access, fills, codes issued, shares, role changes.
- Time-limited access requests + approval (OrkaVault feature).

*Permission model needs a distinct "use" vs "reveal" permission — the
core feature depends on users being able to log in with a credential they
can't view.*

## Browser extension ("the plugin")

- Pairs with the account on install (per-device keypair).
- Autofill for personal items (normal password-manager behaviour).
- Hidden autofill for shared items: fill + submit without display; exact
  origin match before filling.
- Direct-POST login adapters for top sites (password never touches the DOM).
- Requests TOTP codes from the server per approved login.
- WebAuthn provider: forwards passkey challenges to the server for signing.
- Assisted rotation: walks admin through a site's change-password flow.
- QR capture from the current tab when enabling 2FA on a site.

## Mobile (iOS / Android)

- Full vault access, org management, approvals (push notifications).
- Native autofill provider (iOS AutoFill Credential Provider extension;
  Android Autofill Service / Credential Manager) — the mobile "plugin".
- Passkey provider (iOS 17+, Android 14+), same server-signing model.
- Native QR scanning.

## Carried over from OrkaVault

- Time-limited access requests / approvals, stale-approval handling.
- Audit trail, notifications (Discord / Google Chat approve-deny).
- Confidentiality banners / consent, policy editing.
- Health scoring for credentials.
- Workspace-style integrations (later, enterprise tier).

## Not in the idea list yet, but expected of a password manager

- Account recovery / emergency access (critical if E2EE — see 02).
- Password generator; breach / weak-password reports.
- Import from Bitwarden, 1Password, LastPass, CSV, OrkaVault.
- Device management (see and revoke signed-in devices).
- Enterprise: SSO (SAML/OIDC), SCIM provisioning.
- Billing / subscriptions.
