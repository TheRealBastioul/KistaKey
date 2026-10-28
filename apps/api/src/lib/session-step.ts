import type { SessionStep } from "@repo/types";

/**
 * Gate order for a session (decisions §11.18): verify the second factor
 * (if one is set up) → accept pending legal documents → set up a first
 * second factor → ready. Used by the auth hook and the session response.
 */
export function sessionStep(state: {
  mfaEnabled: boolean;
  mfaVerified: boolean;
  pendingLegal: number;
}): SessionStep {
  if (state.mfaEnabled && !state.mfaVerified) return "mfa";
  if (state.pendingLegal > 0) return "legal";
  if (!state.mfaEnabled) return "mfa_setup";
  return "ready";
}
