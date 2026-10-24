# Buildlog Convention

This file defines how and when to record buildlogs for this project. Buildlog
files live in `buildlogs/` and give future-you (or a future Claude session)
a fast, high-signal history of *why* things changed — the git log already
covers *what* changed.

## When to write one

Write a buildlog entry after completing any meaningfully-sized unit of
work: a new feature, a bug fix with a non-obvious cause, a schema/migration
change, a security fix, or a refactor that changes behavior or file
layout. Skip it for trivial changes (typo fixes, formatting, copy tweaks,
dependency bumps with no code impact).

Write the entry at the **end** of the work, once the change is verified
(tests pass / manually confirmed), not before.

## File naming

`buildlogs/YYYY-MM-DD-short-slug.md`

- Date is the day the work was completed.
- Slug is 2-5 words, kebab-case, describing the change (matches the spirit
  of the commit message, doesn't need to match it exactly).
- If multiple entries land the same day, the slug must disambiguate them
  (dates don't need to be unique, filenames do).

## Template

```markdown
# <Short title>
Date: YYYY-MM-DD

## Why
What problem or requirement drove this change. Link to an issue/ticket if
one exists.

## What changed
- path/to/file.ts: one-line description of the change
- path/to/other.jsx: one-line description of the change

## Notes / gotchas
Anything a future reader needs to know that isn't obvious from the diff:
migrations that need to be run manually, follow-up work left undone,
edge cases considered and rejected, etc. Omit this section if there's
nothing worth flagging.
```

## Ground rules

- One file per task/feature, not a running log — makes entries easy to
  grep/link individually and keeps diffs clean.
- Keep entries short (10-30 lines). This is a changelog with context, not
  a design doc.
- Never put secrets, credentials, or customer data in a buildlog — this
  file and its directory are committed to git.
- Reference the buildlog filename in the commit message or PR description
  when practical, so the two stay linked.
