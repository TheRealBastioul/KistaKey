// MFA challenge at login (session step `mfa`): one tab per method the
// session offers. A good answer returns the next SessionResponse, which
// applySession takes (unlocking with the pending login encKey once the
// session is `ready`); the guards then move the user on.
import type { MfaMethod, SessionResponse } from "@repo/types";
import { type FormEvent, useState } from "react";
import { mfaApi } from "../../api/auth";
import { errorMessage } from "../../api/client";
import { useAuth } from "../../auth/AuthProvider";
import {
  isRecoveryCode,
  isTotpCode,
  normalizeRecoveryCode,
  normalizeTotpCode,
} from "../../auth/codes";
import { securityKeyErrorMessage, verifyWithSecurityKey } from "../../auth/webauthn";
import { Alert, Button, Field } from "../../components/ui";

const TAB_LABELS: Record<MfaMethod, string> = {
  totp: "Authenticator app",
  webauthn: "Security key",
  recovery_code: "Recovery code",
};

/** Preferred order for the first tab; recovery codes are the fallback. */
const TAB_ORDER: MfaMethod[] = ["totp", "webauthn", "recovery_code"];

export function MfaChallenge() {
  const { state, applySession } = useAuth();
  const offered = state.status === "session" ? state.session.mfaMethods : [];
  const methods = TAB_ORDER.filter((m) => offered.includes(m));
  const [method, setMethod] = useState<MfaMethod | undefined>(methods[0]);
  const [code, setCode] = useState("");
  const [trustDevice, setTrustDevice] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function switchTo(next: MfaMethod) {
    setMethod(next);
    setCode("");
    setError(null);
  }

  async function run(action: () => Promise<SessionResponse>, describe = errorMessage) {
    setError(null);
    setBusy(true);
    try {
      const next = await action();
      setCode("");
      await applySession(next);
    } catch (err) {
      setError(describe(err));
      setBusy(false);
    }
  }

  function onSubmitCode(event: FormEvent) {
    event.preventDefault();
    if (method === "totp") {
      if (!isTotpCode(code)) {
        setError("Enter the 6-digit code from your authenticator app.");
        return;
      }
      void run(() =>
        mfaApi.verifyCode({ method: "totp", code: normalizeTotpCode(code), trustDevice }),
      );
    } else if (method === "recovery_code") {
      if (!isRecoveryCode(code)) {
        setError("Enter one of your recovery codes, like ABCDE-12345.");
        return;
      }
      void run(() =>
        mfaApi.verifyCode({
          method: "recovery_code",
          code: normalizeRecoveryCode(code),
          trustDevice,
        }),
      );
    }
  }

  const trustBox = (
    <label className="flex items-start gap-2 text-sm">
      <input
        type="checkbox"
        checked={trustDevice}
        onChange={(e) => setTrustDevice(e.target.checked)}
        className="mt-0.5"
      />
      <span>
        Trust this browser for 30 days
        <span className="block text-xs text-muted">Only on a device you alone use.</span>
      </span>
    </label>
  );

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">Two-step login</h1>
        <p className="mt-1 text-sm text-muted">Confirm it's you with your second step.</p>
      </div>

      {methods.length > 1 && (
        <div role="tablist" aria-label="Second step" className="flex gap-1 border-b border-line">
          {methods.map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={m === method}
              onClick={() => switchTo(m)}
              className={`-mb-px border-b-2 px-3 py-2 text-sm ${
                m === method
                  ? "border-accent font-medium text-fg"
                  : "border-transparent text-muted hover:text-fg"
              }`}
            >
              {TAB_LABELS[m]}
            </button>
          ))}
        </div>
      )}

      {error && <Alert tone="error">{error}</Alert>}

      {method === undefined && (
        <Alert tone="error">
          No second step is available for this account. Sign out and use your recovery kit ("Forgot
          master password?") to get back in.
        </Alert>
      )}

      {method === "webauthn" && (
        <div className="flex flex-col gap-4">
          <p className="text-sm">
            Use the security key or built-in authenticator (Windows Hello, Touch ID) you registered.
          </p>
          {trustBox}
          <Button
            busy={busy && "Waiting for your security key…"}
            onClick={() =>
              void run(() => verifyWithSecurityKey(trustDevice), securityKeyErrorMessage)
            }
          >
            Use security key
          </Button>
        </div>
      )}

      {(method === "totp" || method === "recovery_code") && (
        <form onSubmit={onSubmitCode} className="flex flex-col gap-4" noValidate>
          {method === "totp" ? (
            <Field
              key="totp"
              label="6-digit code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={7}
              required
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value)}
              hint="From your authenticator app."
            />
          ) : (
            <Field
              key="recovery_code"
              label="Recovery code"
              autoComplete="off"
              spellCheck={false}
              maxLength={32}
              required
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value)}
              hint="Each code works once."
            />
          )}
          {trustBox}
          <Button type="submit" busy={busy && "Checking…"}>
            Continue
          </Button>
        </form>
      )}
    </div>
  );
}
