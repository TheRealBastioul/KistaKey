// Route guards. UX only: the API enforces every gate itself.
//
// Each auth state has exactly one place the user belongs (targetFor); the
// guards redirect there, so pages never navigate after login/unlock: the
// state change does it.
import { Navigate, Outlet, useLocation } from "react-router";
import { type AuthState, useAuth } from "./AuthProvider";

/** Where this state must go, or null when the app itself may render. */
export function targetFor(state: AuthState): string | null {
  switch (state.status) {
    case "loading":
      return null;
    case "signed_out":
      return "/login";
    case "session":
      switch (state.session.step) {
        case "mfa":
          return "/login/mfa";
        case "legal":
          return "/accept-terms";
        case "mfa_setup":
          return "/setup/mfa";
        case "ready":
          return state.unlocked ? null : "/lock";
      }
  }
}

interface FromState {
  from?: string;
}

function Splash() {
  return (
    <div className="grid min-h-dvh place-items-center text-sm text-muted" aria-busy="true">
      Loading…
    </div>
  );
}

/** The signed-in app: needs a ready session and an unlocked key. */
export function RequireApp() {
  const { state } = useAuth();
  const location = useLocation();
  if (state.status === "loading") return <Splash />;
  const target = targetFor(state);
  if (target) {
    const from: FromState = { from: location.pathname + location.search };
    return <Navigate to={target} replace state={from} />;
  }
  return <Outlet />;
}

/**
 * A gate page (lock, MFA challenge, legal, MFA setup): shown only while it's
 * the current target; once the state moves on, go to the next target, or
 * back to where the user was headed.
 */
export function RequireStep({ path }: { path: string }) {
  const { state } = useAuth();
  const location = useLocation();
  if (state.status === "loading") return <Splash />;
  const target = targetFor(state);
  if (target === path) return <Outlet />;
  const from = (location.state as FromState | null)?.from;
  return <Navigate to={target ?? from ?? "/vault"} replace state={location.state} />;
}

/** Signed-out pages (login, signup): a signed-in user is sent on. */
export function PublicOnly() {
  const { state } = useAuth();
  const location = useLocation();
  if (state.status === "loading") return <Splash />;
  if (state.status === "signed_out") return <Outlet />;
  const from = (location.state as FromState | null)?.from;
  return <Navigate to={targetFor(state) ?? from ?? "/vault"} replace state={location.state} />;
}
