# Commands to run (Phases 10–12 verification)

Phases 10 (realtime sync), 11 (password health + generator page) and 12
(import & export) were built in one session. No migration. New web
dependencies (`@zxcvbn-ts/core`, `@zxcvbn-ts/language-common`,
`@zxcvbn-ts/language-en`, `fflate`), so start with `pnpm install`. Run
from the repo root, in order, and tick each box as it passes. If a step
fails, save its output and tell Claude:

```
<command> > ref\error.md 2>&1
```

## Checks

**Verified by the user 2026-10-28.** Phase 13 replaces this list.

- [x] `pnpm install` (adds zxcvbn-ts + fflate to `apps/web`)
- [x] `pnpm typecheck`
- [x] `pnpm lint`
- [x] `pnpm test` (new: `realtime.hub.test.ts`, `integration/realtime.test.ts`, `/vault/exported` case in `integration/vault.test.ts`, `crypto/vaultExport.test.ts`, web `live.test.ts`, `health.test.ts`, `import/import.test.ts`)
- [x] `pnpm services:up`, then `pnpm dev`; open http://127.0.0.1:5173 and log in

### Phase 10: realtime

- [x] Log in to the same account in a second window (private window / other browser), open `/vault` in both: the sidebar shows **Live**
- [x] Create, edit, trash and delete an item in one window → the other updates within a second or two, no refresh
- [x] Stop the API (Ctrl+C in `pnpm dev`) → **Reconnecting…**; restart it → **Live** again within a minute, and changes made meanwhile show up
- [x] Settings → Security → revoke the other window's session → that window is signed out within ~25 s

### Phase 11: health & generator

- [x] Two logins with the same password and one with `password1` → the dashboard's **Password health** shows Reused 2 and Weak ≥ 1; clicking each count lists just those items
- [x] Change one of the reused passwords → Reused drops to 0
- [x] **Generator** (main nav): switch Password / Passphrase, move the sliders, toggle options → the preview updates; **Copy** → it's listed under "Copied this session"; Lock now and unlock → the list is empty

### Phase 12: import & export

- [x] Settings → **Import & export** → Bitwarden (.json) → pick an unencrypted Bitwarden export → preview counts → **Import** → progress bar → items and folders show in the vault
- [x] **Download encrypted backup** → import that file as "Encrypted backup" → same item count (duplicates expected)
- [x] **Export as CSV…**: button disabled until the box is ticked and a password entered; a wrong password is rejected; the right one downloads the CSV → import it as "Bitwarden (.csv)" → names, usernames, passwords, sites, notes, folders and TOTP codes match
- [x] Delete the test duplicates

## After everything passes

- [x] Tell Claude "phases 10–12 verified"
