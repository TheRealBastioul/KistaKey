// Auth hook: resolves the session cookie into request.auth and enforces the
// gates in order (decisions §11.18):
//   session valid → user active → MFA verified (if set up) →
//   legal accepted → MFA set up → route.
// Routes are locked down by default; a route opts out of a gate with
// `config: { auth: { allow: [...] } }`, or out of auth entirely with
// `config: { auth: "public" }`.
import type { PendingLegal, SessionStep } from "@repo/types";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { SecurityConfig } from "../config/security";
import { type UserTenant, userTenant } from "../db/tenant";
import type { Actor } from "../lib/actor";
import { AppError, unauthorized } from "../lib/errors";
import { clearCookie, cookieNames } from "../lib/http";
import { sessionStep } from "../lib/session-step";
import type { LegalService } from "../modules/legal";
import type { SessionContext, SessionsService } from "../modules/sessions";
import type { UsersService } from "../modules/users";

/** Steps a route may be reached in besides "ready". */
export type GateStep = Exclude<SessionStep, "ready">;

export type RouteAuth = "public" | { allow: GateStep[] };

export interface AuthContext {
  user: { id: string; email: string; emailVerified: boolean };
  session: SessionContext;
  /** Scope for every personal-data query. From the session, never from input. */
  tenant: UserTenant;
  step: SessionStep;
  mfaEnabled: boolean;
  pendingLegal: PendingLegal[];
}

declare module "fastify" {
  interface FastifyRequest {
    auth: AuthContext | null;
  }
  interface FastifyContextConfig {
    auth?: RouteAuth;
  }
}

const GATE_ERRORS: Record<GateStep, () => AppError> = {
  mfa: () => new AppError(403, "MFA_REQUIRED", "Second factor required"),
  legal: () => new AppError(403, "LEGAL_ACCEPTANCE_REQUIRED", "Accept the updated terms first"),
  mfa_setup: () => new AppError(403, "MFA_SETUP_REQUIRED", "Set up two-step login first"),
};

/** request.auth for a route behind the hook (never null there). */
export function requireAuth(req: FastifyRequest): AuthContext {
  if (!req.auth) throw unauthorized();
  return req.auth;
}

/** The acting user/device/session, for services. */
export function actorOf(req: FastifyRequest): Actor {
  const auth = requireAuth(req);
  return {
    tenant: auth.tenant,
    userId: auth.user.id,
    deviceId: auth.session.deviceId,
    sessionId: auth.session.id,
  };
}

export interface AuthPluginDeps {
  config: SecurityConfig;
  sessions: SessionsService;
  users: UsersService;
  legal: LegalService;
}

/**
 * Resolves the cookie into an AuthContext, or null if there's no valid
 * session. Used by the hook and by public routes that behave differently
 * when signed in.
 */
export async function resolveAuth(
  req: FastifyRequest,
  reply: FastifyReply,
  deps: AuthPluginDeps,
): Promise<AuthContext | null> {
  const names = cookieNames(deps.config.cookieSecure);
  const token = req.cookies[names.session];
  if (!token) return null;

  const session = await deps.sessions.validate(token);
  const user = session ? await deps.users.getState(session.userId) : null;
  if (
    !session ||
    !user ||
    user.status !== "active" ||
    user.securityStamp !== session.securityStamp
  ) {
    clearCookie(reply, names.session, deps.config.cookieSecure);
    return null;
  }

  const pendingLegal = await deps.legal.pending(user.id);
  return {
    user: { id: user.id, email: user.email, emailVerified: user.emailVerified },
    session,
    tenant: userTenant(user.id),
    step: sessionStep({
      mfaEnabled: user.mfaEnabled,
      mfaVerified: session.mfaVerified,
      pendingLegal: pendingLegal.length,
    }),
    mfaEnabled: user.mfaEnabled,
    pendingLegal,
  };
}

export function registerAuth(app: FastifyInstance, deps: AuthPluginDeps): void {
  app.decorateRequest("auth", null);

  app.addHook("onRequest", async (req, reply) => {
    // Unmatched routes fall through to the 404 handler.
    if (!req.routeOptions.url) return;
    const routeAuth = req.routeOptions.config.auth;
    if (routeAuth === "public") return;

    const auth = await resolveAuth(req, reply, deps);
    if (!auth) throw unauthorized();
    req.auth = auth;

    if (auth.step !== "ready" && !routeAuth?.allow.includes(auth.step)) {
      throw GATE_ERRORS[auth.step]();
    }
  });
}
