// The product name lives in @repo/types (ref/decisions.md §8, §11.15) so the
// API and every client share it. Also change index.html's <title>.
export { APP_NAME } from "@repo/types";

/** Lock the vault after this much inactivity (a user setting later). */
export const AUTO_LOCK_MS = 15 * 60 * 1000;

/** Master password minimum. Everything else is guidance from the strength meter. */
export const MIN_PASSWORD_LENGTH = 12;
