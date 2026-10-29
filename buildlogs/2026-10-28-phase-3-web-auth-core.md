# Phase 3: web auth core
Date: 2026-10-28

## Why
The browser half of accounts: sign up (with recovery kit), verify email,
log in and lock/unlock, with all crypto off the main thread and the user
key in memory only. Plan: `plan/phase-03-web-auth-core/README.md`.

## What changed
- apps/web/src/crypto/worker.ts, client.ts: ES module crypto worker + typed RPC (`cryptoClient.call`)
- apps/web/src/auth/keyStore.ts (+ test): in-memory user key, idle auto-lock, wipe on lock
- apps/web/src/auth/AuthProvider.tsx: auth state, login/unlock/lock/logout, pending login encKey
- apps/web/src/auth/guards.tsx: `targetFor` + `RequireApp` / `RequireStep` / `PublicOnly`
- apps/web/src/auth/passwordStrength.ts (+ test), components/StrengthMeter.tsx
- apps/web/src/components/ui.tsx, RecoveryKit.tsx, ResendVerification.tsx
- apps/web/src/layout/AuthLayout.tsx; pages/auth/{Signup,CheckEmail,VerifyEmail,Login,Lock}.tsx
- apps/web/src/router.tsx, main.tsx: auth routes, gate placeholders (Phases 4–5), `AuthProvider`
- ref/decisions.md §13: calls made while building

## Notes / gotchas
- Verified by the user on 2026-10-28 (`ref/commands.md`); folder moved to `plan/completed/`.
- Lock-screen checks need a `ready` session (MFA setup), so they're in Phase 4's Verify.
- Signup parses the request with `SignupRequestSchema` because `@repo/crypto`'s
  `KdfParams.parallelism` is `number` while the contract's is the literal `1`.
- Worker returns copies (structured clone); it wipes its own byte arrays after posting.
