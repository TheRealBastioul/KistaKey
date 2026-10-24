# Vision & Security Model

Product name not chosen yet (see `decisions.md` §8). Related docs:

- `vision.md` (this file): what it is, the core promise, security model
- `features.md`: full feature list
- `decisions.md`: decision log (every product/architecture decision + answer)
- `orkavault-carryover.md`: what to keep from OrkaVault (the predecessor app)
- `design.md`: target design: repo layout, backend, crypto, clients
- `../plan/README.md`: build order (phases) and status
- `../ARCHITECTURE.md`: map of what's actually built (kept current)
- `../ref/OrkaVault-Architecture.md`: OrkaVault's file map, for porting features

## What it is

A credential manager (Bitwarden-style personal + org vaults) built as a new
app, carrying over OrkaVault's functionality (time-limited access, request /
approve, audit trail, confidentiality banners) and adding one original
feature: **sharing access to an account without giving away the ability to
use it outside the vault.**

Platforms: Web, browser extension, iOS, Android. Target scale: 500k+ users.

## The problem

Many platforms (e.g. Instagram personal accounts, vendor portals, legacy
tools) have no delegation — social media managers and vendors have to be
given the username and password. Once they have it, access can't really be
taken back.

## The core promise (decided)

> **Shared users can only log in through the app. Revoke access and they're
> locked out instantly — even if they wrote the password down.**

We do **not** promise "the user can never see the password." On an
unmanaged browser that can't be guaranteed (DevTools, extension
inspection, modified extensions), and every password manager that offers
"hidden password" sharing has this limit. Overclaiming it is the real
publicity risk. Hidden autofill is a *convenience* feature, not a security
claim.

## How the promise is enforced

| Mechanism | What the shared user can extract | Can they log in without the vault? |
|---|---|---|
| **Server-signed passkeys** — private key lives only in server KMS/HSM; extension forwards the WebAuthn challenge, server signs if the grant is valid | Nothing reusable (one-time, origin-bound assertion) | No |
| **Vault-held TOTP** — 2FA seed stored server-side only; one code issued per approved login | The password, with effort | No — code is server-gated |
| **Password only** | The password | Yes, until rotation |

Supporting layers:
- **Hidden autofill / direct POST** (extension) — fills or submits without
  showing the password. Deterrent only.
- **Rotation on revoke / grant end** — assisted change-password flow so an
  extracted password goes stale.
- **Per-credential protection label** (Strong / Basic) shown to admins, with
  a nudge to enable vault-held 2FA on anything sensitive.

## Explicitly out of scope

- Remote browser isolation / hosted VMs (CyberArk-style).
- Requiring managed browsers or device enrollment. Must work on any normal
  browser with one extension install, for individuals and for enterprise
  vendors alike. Low-friction onboarding is a product goal.

## Differentiators vs Bitwarden / 1Password

1. Vault-gated access (server-custodied TOTP + passkeys) for shared items.
2. Time-limited access requests with approval (from OrkaVault).
3. Cross-org / vendor sharing with expiry and instant revocation.
4. Full audit of every fill / code / passkey signature, per user + device.
5. Honest per-credential protection strength.
