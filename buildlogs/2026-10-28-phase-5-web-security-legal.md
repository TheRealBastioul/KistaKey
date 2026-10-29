# Phase 5: web security settings & legal
Date: 2026-10-28

## Why
Last accounts phase: Settings → Security, readable legal documents and
the legal acceptance gate, plus the account menu. Also closes the Phase 4
open question: account recovery now drops MFA trust on every device (user
call, decisions §14.1).

## What changed
- apps/api/src/modules/devices/*: `clearAllTrust` / `untrustAll`
- apps/api/src/modules/auth/auth.service.ts: `recoverComplete` untrusts every device (`devicesUntrusted` in audit metadata)
- apps/api/test/integration/auth.test.ts: trusted browser is challenged again after recovery
- apps/web/src/components/markdownParser.ts, Markdown.tsx, markdown.test.ts: safe Markdown subset, React elements only, XSS fixtures
- apps/web/src/legal/useLegalDocuments.ts, pages/legal/LegalPage.tsx: `/legal/:key`
- apps/web/src/pages/auth/AcceptTerms.tsx: gate with per-document checkboxes and version-conflict retry
- apps/web/src/pages/auth/Signup.tsx: consent checkbox links to the documents
- apps/web/src/pages/settings/*: settings layout, `/settings/security` with six sections
- apps/web/src/layout/UserMenu.tsx, AppShell.tsx, AuthLayout.tsx (`wide`), router.tsx
- apps/web/src/lib/useLoad.ts; auth/codes.ts (`groupSecret` moved from SetupMfa)

## Notes / gotchas
- Never give two files in one folder names that differ only by case
  (`markdown.ts` + `Markdown.tsx`): on Windows `./Markdown` resolved to the
  `.ts` parser, so the component import was `undefined` (14 test failures).
  The Linux shared-folder side didn't show it.
- Links in Markdown only keep absolute http/https/mailto URLs; relative
  links render as text. Org content (Phase 44) may need relative links:
  revisit `safeHref` there, not by loosening it ad hoc.
- To see the legal gate in dev, delete the user's LegalAcceptance rows
  (Prisma Studio); publishing a v2 sticks in the dev DB.
- Verified by the user 2026-10-28.
