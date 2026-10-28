import type { LegalSource } from "./index";

// Placeholder text: replace with a reviewed notice before launch (as a new version).
// Never interpolate values (e.g. the product name) into a body: the text of
// a published version must never change.
export const PRIVACY_VERSIONS: LegalSource[] = [
  {
    key: "privacy",
    version: 1,
    title: "Privacy Notice",
    requiresReacceptance: true,
    publishedAt: "2026-10-28T00:00:00Z",
    body: `# Privacy Notice

**Draft.** This notice is a placeholder until the service launches.

## What we can't see

Vault contents, your master password and your encryption keys never
leave your devices unencrypted. We store only encrypted data.

## What we store

- Your email address and account settings.
- Encrypted keys, which only your master password or recovery key can
  open.
- Sign-in records: devices, sessions, IP addresses and an audit log of
  security events, kept to protect your account.

## Email

We email you to verify your address and when something security-related
happens (a new device signs in, your password changes, account recovery
is used).
`,
  },
];
