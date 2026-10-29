// Turns what the user gives the editor for a TOTP key (a scanned or pasted
// otpauth:// URI, or a bare base32 secret) into the stored TotpConfig, plus
// the issuer and account an otpauth URI carries for prefilling the item.
// These @repo/crypto subpaths don't load libsodium, so they're safe here.
import { parseOtpAuthUri } from "@repo/crypto/otpauth";
import { normalizeTotpSecret, TOTP_DEFAULTS } from "@repo/crypto/totp";
import { type TotpConfig, TotpConfigSchema } from "@repo/types";

export interface TotpInput {
  totp: TotpConfig;
  /** "" for a bare secret. */
  issuer: string;
  account: string;
}

/** Spelled out: Omit<> on the loose TotpConfig would keep only its index signature. */
export interface TotpSettings {
  algorithm: TotpConfig["algorithm"];
  digits: number;
  period: number;
}

export const DEFAULT_TOTP_SETTINGS: TotpSettings = { ...TOTP_DEFAULTS };

const INVALID_SECRET = "That isn't a valid setup key. It's letters A–Z and digits 2–7 (base32).";

function sentence(message: string): string {
  const text = message.charAt(0).toUpperCase() + message.slice(1);
  return text.endsWith(".") ? text : `${text}.`;
}

/**
 * A URI brings its own settings; a bare secret uses `settings`. Throws an
 * Error whose message the editor shows as is.
 */
export function parseTotpInput(
  text: string,
  settings: TotpSettings = DEFAULT_TOTP_SETTINGS,
): TotpInput {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("Enter the setup key or scan its QR code.");
  try {
    if (/^otpauth:/i.test(trimmed)) {
      const { issuer, account, ...params } = parseOtpAuthUri(trimmed);
      return { totp: TotpConfigSchema.parse(params), issuer, account };
    }
    // Sites often show the key in groups ("ABCD EFGH" or "ABCD-EFGH").
    const secret = normalizeTotpSecret(trimmed.replaceAll("-", ""));
    return { totp: TotpConfigSchema.parse({ ...settings, secret }), issuer: "", account: "" };
  } catch (err) {
    if (/^otpauth:/i.test(trimmed) && err instanceof Error && err.name === "CryptoError") {
      throw new Error(sentence(err.message));
    }
    throw new Error(INVALID_SECRET);
  }
}

/** What to fill in from a scanned URI: only fields the user left empty. */
export function prefillFromTotp(
  input: TotpInput,
  current: { name: string; username: string },
): { name: string; username: string } {
  return {
    name: current.name.trim() || input.issuer || input.account,
    username: current.username.trim() || input.account,
  };
}
