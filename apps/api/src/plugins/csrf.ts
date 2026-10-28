// CSRF (decisions §11.8, OrkaVault pattern): GET /auth/csrf sets an
// httpOnly cookie and returns the same token; clients send it back in the
// x-csrf-token header on every unsafe method. A cross-site page can't read
// the token, so it can't forge the header. Routes that must accept
// requests without it (future webhooks) set `config: { csrf: false }`.
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { SecurityConfig } from "../config/security";
import { AppError } from "../lib/errors";
import { cookieNames, cookieOptions } from "../lib/http";
import { randomToken, safeEqual } from "../lib/secrets";

declare module "fastify" {
  interface FastifyContextConfig {
    /** false = exempt from the CSRF check (webhooks only). */
    csrf?: false;
  }
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export const CSRF_HEADER = "x-csrf-token";

export function registerCsrf(app: FastifyInstance, config: SecurityConfig): void {
  const name = cookieNames(config.cookieSecure).csrf;

  app.addHook("onRequest", async (req) => {
    if (SAFE_METHODS.has(req.method) || !req.routeOptions.url) return;
    if (req.routeOptions.config.csrf === false) return;
    const cookie = req.cookies[name];
    const header = req.headers[CSRF_HEADER];
    if (!cookie || typeof header !== "string" || !safeEqual(cookie, header)) {
      throw new AppError(403, "CSRF_INVALID", "Missing or invalid CSRF token");
    }
  });
}

/** GET /auth/csrf: reuses a well-formed existing token, else issues one. */
export function issueCsrfToken(
  req: FastifyRequest,
  reply: FastifyReply,
  config: SecurityConfig,
): string {
  const name = cookieNames(config.cookieSecure).csrf;
  const existing = req.cookies[name];
  const token = existing && TOKEN_PATTERN.test(existing) ? existing : randomToken();
  reply.setCookie(name, token, cookieOptions(config.cookieSecure));
  return token;
}
