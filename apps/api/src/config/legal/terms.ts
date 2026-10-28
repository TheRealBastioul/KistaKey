import type { LegalSource } from "./index";

// Placeholder text: replace with reviewed terms before launch (as a new version).
// Never interpolate values (e.g. the product name) into a body: the text of
// a published version must never change.
export const TERMS_VERSIONS: LegalSource[] = [
  {
    key: "terms",
    version: 1,
    title: "Terms of Service",
    requiresReacceptance: true,
    publishedAt: "2026-10-28T00:00:00Z",
    body: `# Terms of Service

**Draft.** These terms are a placeholder until the service launches.

## Your account

- You're responsible for your master password and your **recovery kit**.
- Your vault is encrypted on your device. We can't read it, and we
  **can't reset your master password**. If you lose both your master
  password and your recovery key, your data can't be recovered.
- Keep two-step login (an authenticator app or a security key) set up.

## Acceptable use

Don't use the service to store or share credentials you aren't
authorized to use, or to attack other people's accounts.

## Changes

We'll ask you to accept again when these terms change in a way that
matters.
`,
  },
];
