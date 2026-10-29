// Security keys / platform authenticators (Windows Hello, Touch ID) as a
// second factor. The browser ceremony runs here; the API checks the result.
// Errors are mapped to short, generic messages: no authenticator or
// browser detail reaches the page.

import type { MfaEnrollResponse, SessionResponse } from "@repo/types";
import {
  browserSupportsWebAuthn,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  startAuthentication,
  startRegistration,
  WebAuthnError,
} from "@simplewebauthn/browser";
import { mfaApi } from "../api/auth";
import { ApiError, errorMessage } from "../api/client";

export { browserSupportsWebAuthn };

/** Registers a new security key (MFA setup). */
export async function registerSecurityKey(name: string): Promise<MfaEnrollResponse> {
  const { options } = await mfaApi.webauthnRegisterOptions();
  const response = await startRegistration({
    optionsJSON: options as unknown as PublicKeyCredentialCreationOptionsJSON,
  });
  return mfaApi.webauthnRegisterVerify(response as unknown as Record<string, unknown>, name);
}

/** Signs the login challenge with a registered security key. */
export async function verifyWithSecurityKey(trustDevice: boolean): Promise<SessionResponse> {
  const { options } = await mfaApi.webauthnOptions();
  const response = await startAuthentication({
    optionsJSON: options as unknown as PublicKeyCredentialRequestOptionsJSON,
  });
  return mfaApi.webauthnVerify(response as unknown as Record<string, unknown>, trustDevice);
}

/** A human message for a failed ceremony or API call. */
export function securityKeyErrorMessage(err: unknown): string {
  if (err instanceof ApiError) return errorMessage(err);
  if (err instanceof WebAuthnError && err.code === "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED") {
    return "This security key is already registered.";
  }
  if (err instanceof Error && (err.name === "NotAllowedError" || err.name === "AbortError")) {
    return "The security key prompt was cancelled or timed out. Try again.";
  }
  return "The security key didn't work. Try again or use another method.";
}
