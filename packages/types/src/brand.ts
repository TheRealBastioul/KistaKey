// Product name placeholder. The name isn't chosen yet (ref/decisions.md
// §8). This is the only place it's set: the web app re-exports it
// (apps/web/src/config.ts), the API uses it for the TOTP issuer, WebAuthn
// relying-party name and emails. Also change apps/web/index.html's <title>.
export const APP_NAME = "Untitled";
