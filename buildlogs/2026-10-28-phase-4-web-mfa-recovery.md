# Phase 4: web MFA setup, MFA challenge, account recovery
Date: 2026-10-28

## Why
Phase 3 left the gate pages as placeholders, so no web session could reach
`ready`. Phase 4 adds the second-factor and recovery screens on top of the
Phase 2 API. Verified by the user 2026-10-28.

## What changed
- apps/web/src/pages/auth/SetupMfa.tsx: forced setup (TOTP QR + setup key, or security key) → recovery codes → `refresh()` unlocks with the pending login encKey
- apps/web/src/pages/auth/MfaChallenge.tsx: tabs per `mfaMethods`, trust-device checkbox, result goes to `applySession`
- apps/web/src/pages/auth/Recover.tsx: email + recovery key → new password → new recovery kit → `/login`
- apps/web/src/auth/codes.ts (+ test): TOTP / recovery code input normalization
- apps/web/src/auth/webauthn.ts: register/verify ceremonies, generic error messages
- apps/web/src/components/RecoveryCodes.tsx; src/lib/saveText.ts (download/print now shared with RecoveryKit, which gained `title`/`intro`)
- apps/web/src/router.tsx: placeholders for `/recover`, `/login/mfa`, `/setup/mfa` replaced

## Notes / gotchas
- Enrolling the first method makes the session `ready` server-side, but the
  web state is refreshed only after the codes are acknowledged, so the
  guard doesn't navigate away from the codes.
- Recovery wrap key stays in a ref until `/auth/recover/complete` succeeds
  (network retry works); wiped on success, restart and unmount.
- Device trust survives account recovery (API behaviour, unchanged here):
  open question recorded in Phase 5's "Decisions at phase start".
