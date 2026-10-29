// otpauth:// URIs, the format inside authenticator QR codes (Google's
// "Key Uri Format"):
//   otpauth://totp/Issuer:account?secret=BASE32&issuer=Issuer&algorithm=SHA1&digits=6&period=30
// Hand-parsed rather than with `URL`, which treats unknown schemes
// differently across browsers and React Native. Only TOTP: an HOTP counter
// can't be kept in step across devices.
import { CryptoError } from "./errors";
import {
  assertTotpParams,
  normalizeTotpSecret,
  TOTP_ALGORITHMS,
  TOTP_DEFAULTS,
  type TotpAlgorithm,
  type TotpParams,
} from "./totp";

export interface OtpAuth extends TotpParams {
  /** From the `issuer` parameter, else the label prefix; "" if neither. */
  issuer: string;
  /** Label after the issuer prefix (usually the username or email); may be "". */
  account: string;
}

const MAX_URI_LENGTH = 4096;

function decodePart(text: string, plusIsSpace: boolean): string {
  try {
    return decodeURIComponent(plusIsSpace ? text.replaceAll("+", " ") : text);
  } catch {
    throw new CryptoError("otpauth URI has invalid percent-encoding");
  }
}

function parseInteger(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined || value === "") return fallback;
  if (!/^\d{1,6}$/.test(value)) throw new CryptoError(`otpauth ${name} must be a number`);
  return Number(value);
}

function parseAlgorithm(value: string | undefined): TotpAlgorithm {
  if (value === undefined || value === "") return TOTP_DEFAULTS.algorithm;
  const upper = value.toUpperCase().replace("-", "");
  const match = TOTP_ALGORITHMS.find((alg) => alg === upper);
  if (!match) throw new CryptoError(`unsupported otpauth algorithm "${value}"`);
  return match;
}

/** Parses and validates a TOTP URI. Throws CryptoError with a user-presentable reason. */
export function parseOtpAuthUri(uri: string): OtpAuth {
  const text = uri.trim();
  if (text.length > MAX_URI_LENGTH) throw new CryptoError("otpauth URI is too long");
  const match = /^otpauth:\/\/([^/?#]*)\/([^?#]*)(?:\?([^#]*))?(?:#.*)?$/i.exec(text);
  if (!match) throw new CryptoError("not an otpauth:// URI");
  const [, type = "", rawLabel = "", rawQuery = ""] = match;
  if (type.toLowerCase() === "hotp") throw new CryptoError("HOTP codes aren't supported");
  if (type.toLowerCase() !== "totp") throw new CryptoError(`unknown otpauth type "${type}"`);

  const params = new Map<string, string>();
  for (const pair of rawQuery.split("&")) {
    if (pair === "") continue;
    const eq = pair.indexOf("=");
    const key = decodePart(eq < 0 ? pair : pair.slice(0, eq), true).toLowerCase();
    // First occurrence wins, like most authenticator apps.
    if (!params.has(key)) params.set(key, eq < 0 ? "" : decodePart(pair.slice(eq + 1), true));
  }

  const secret = params.get("secret");
  if (!secret) throw new CryptoError("otpauth URI has no secret");

  // Label: "Issuer:account" or just "account"; the colon may be encoded.
  const label = decodePart(rawLabel, false);
  const colon = label.indexOf(":");
  const labelIssuer = colon < 0 ? "" : label.slice(0, colon).trim();
  const account = (colon < 0 ? label : label.slice(colon + 1)).trim();

  const result: OtpAuth = {
    secret: normalizeTotpSecret(secret),
    algorithm: parseAlgorithm(params.get("algorithm")),
    digits: parseInteger(params.get("digits"), TOTP_DEFAULTS.digits, "digits"),
    period: parseInteger(params.get("period"), TOTP_DEFAULTS.period, "period"),
    issuer: params.get("issuer")?.trim() || labelIssuer,
    account,
  };
  assertTotpParams(result);
  return result;
}

/** Builds a URI that parseOtpAuthUri (and authenticator apps) read back; for QR export. */
export function formatOtpAuthUri(otp: OtpAuth): string {
  assertTotpParams(otp);
  const label = otp.issuer
    ? `${encodeURIComponent(otp.issuer)}:${encodeURIComponent(otp.account)}`
    : encodeURIComponent(otp.account);
  const query = [`secret=${normalizeTotpSecret(otp.secret)}`];
  if (otp.issuer) query.push(`issuer=${encodeURIComponent(otp.issuer)}`);
  query.push(`algorithm=${otp.algorithm}`, `digits=${otp.digits}`, `period=${otp.period}`);
  return `otpauth://totp/${label}?${query.join("&")}`;
}
