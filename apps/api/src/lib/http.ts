// Small request/response helpers shared by the auth routes and plugins.
import type { CookieSerializeOptions } from "@fastify/cookie";
import type { FastifyReply, FastifyRequest } from "fastify";

/** Request context for audit entries and session/device rows. */
export interface RequestMeta {
  id: string;
  ip: string;
  userAgent?: string;
}

export function requestMeta(req: FastifyRequest): RequestMeta {
  const ua = req.headers["user-agent"];
  return { id: req.id, ip: req.ip, ...(ua ? { userAgent: ua.slice(0, 512) } : {}) };
}

/**
 * Cookie names. With Secure cookies they get the __Host- prefix, which
 * browsers only accept from a secure origin, with path=/ and no Domain, so
 * a subdomain can't plant or overwrite them.
 */
export function cookieNames(secure: boolean) {
  const prefix = secure ? "__Host-" : "";
  return {
    session: `${prefix}sid`,
    device: `${prefix}did`,
    csrf: `${prefix}csrf`,
  } as const;
}

export function cookieOptions(secure: boolean, maxAgeMs?: number): CookieSerializeOptions {
  return {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    ...(maxAgeMs === undefined ? {} : { maxAge: Math.floor(maxAgeMs / 1000) }),
  };
}

export function clearCookie(reply: FastifyReply, name: string, secure: boolean): void {
  reply.clearCookie(name, cookieOptions(secure));
}

// First match wins, so more specific tokens come first (Edge/Opera UAs also say "Chrome").
const BROWSERS: [RegExp, string][] = [
  [/Edg\//, "Edge"],
  [/OPR\//, "Opera"],
  [/Firefox\//, "Firefox"],
  [/Chrome\//, "Chrome"],
  [/Safari\//, "Safari"],
];
const SYSTEMS: [RegExp, string][] = [
  [/Windows/, "Windows"],
  [/iPhone|iPad/, "iOS"],
  [/Mac OS X/, "macOS"],
  [/Android/, "Android"],
  [/Linux/, "Linux"],
];

/** "Chrome on Windows"-style label for device lists. Best effort; never trusted. */
export function describeUserAgent(ua: string | undefined): string {
  if (!ua) return "Unknown device";
  const browser = BROWSERS.find(([re]) => re.test(ua))?.[1] ?? "Browser";
  const os = SYSTEMS.find(([re]) => re.test(ua))?.[1] ?? "unknown OS";
  return `${browser} on ${os}`;
}
