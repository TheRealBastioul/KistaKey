// Byte <-> text helpers. Pure JS (no libsodium), so they work before
// ready() and identically in browsers, workers and Node.
import { CryptoError } from "./errors";

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

export function utf8Encode(text: string): Uint8Array<ArrayBuffer> {
  return encoder.encode(text);
}

export function utf8Decode(bytes: Uint8Array): string {
  try {
    return decoder.decode(bytes);
  } catch {
    throw new CryptoError("invalid UTF-8");
  }
}

/** base64url without padding: the only base64 flavour used in blobs and on the wire. */
export function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

const BASE64URL = /^[A-Za-z0-9_-]*$/;

export function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  if (!BASE64URL.test(text) || text.length % 4 === 1) throw new CryptoError("invalid base64url");
  const padded =
    text.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - (text.length % 4)) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export function toHex(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

export function fromHex(text: string): Uint8Array<ArrayBuffer> {
  if (!/^(?:[0-9a-f]{2})*$/i.test(text)) throw new CryptoError("invalid hex");
  const out = new Uint8Array(text.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(text.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function concatBytes(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}
