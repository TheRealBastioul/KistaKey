// Input normalization for second-factor codes. The server normalizes
// recovery codes again (case, dashes, O/0, I/L/1); this only makes the
// common paste/typing shapes pass the contract's schemas.
import { RecoveryCodeSchema, TotpCodeSchema } from "@repo/types";

/** A TOTP setup key in groups of 4 ("JBSW Y3DP EHPK 3PXP"), easier to type by hand. */
export function groupSecret(secret: string): string {
  return secret.match(/.{1,4}/g)?.join(" ") ?? secret;
}

/** "123 456", "123-456", " 123456 " → "123456". Anything else is returned stripped of separators. */
export function normalizeTotpCode(input: string): string {
  return input.replace(/[\s-]/g, "");
}

export function isTotpCode(input: string): boolean {
  return TotpCodeSchema.safeParse(normalizeTotpCode(input)).success;
}

/** Trimmed and upper-cased; separators are kept (the server strips them). */
export function normalizeRecoveryCode(input: string): string {
  return input.trim().toUpperCase();
}

export function isRecoveryCode(input: string): boolean {
  const code = normalizeRecoveryCode(input);
  return code.replace(/[\s-]/g, "").length === 10 && RecoveryCodeSchema.safeParse(code).success;
}
