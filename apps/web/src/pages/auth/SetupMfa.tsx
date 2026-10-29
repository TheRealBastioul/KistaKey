// Forced MFA setup (session step `mfa_setup`): add a first method, then
// save the recovery codes the API issues with it. Enrolling passes MFA for
// this session, so "Continue" re-reads the session: it's `ready`, and the
// pending login encKey unlocks the vault without a second password prompt.
import type { TotpSetupResponse } from "@repo/types";
import { toDataURL } from "qrcode";
import { type FormEvent, useState } from "react";
import { mfaApi } from "../../api/auth";
import { errorMessage } from "../../api/client";
import { useAuth } from "../../auth/AuthProvider";
import { groupSecret, isTotpCode, normalizeTotpCode } from "../../auth/codes";
import {
  browserSupportsWebAuthn,
  registerSecurityKey,
  securityKeyErrorMessage,
} from "../../auth/webauthn";
import { RecoveryCodes } from "../../components/RecoveryCodes";
import { Alert, Button, Field } from "../../components/ui";

type Step =
  | { kind: "choose" }
  | { kind: "totp"; setup: TotpSetupResponse; qr: string }
  | { kind: "key" }
  | { kind: "codes"; codes: string[] };

export function SetupMfa() {
  const { state, refresh } = useAuth();
  const email = state.status === "session" ? state.session.user.email : "";
  const [step, setStep] = useState<Step>({ kind: "choose" });
  const [code, setCode] = useState("");
  const [keyName, setKeyName] = useState("Security key");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function back() {
    setError(null);
    setCode("");
    setStep({ kind: "choose" });
  }

  /** After enrolling: show the codes, or (not the first method) go straight on. */
  async function enrolled(codes: string[] | null) {
    setCode("");
    if (codes) setStep({ kind: "codes", codes });
    else await refresh();
  }

  async function startTotp() {
    setError(null);
    setBusy(true);
    try {
      const setup = await mfaApi.totpSetup();
      const qr = await toDataURL(setup.otpauthUri, { margin: 1, width: 192 });
      setStep({ kind: "totp", setup, qr });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function confirmTotp(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!isTotpCode(code)) {
      setError("Enter the 6-digit code from your authenticator app.");
      return;
    }
    setBusy(true);
    try {
      const { recoveryCodes } = await mfaApi.totpConfirm(normalizeTotpCode(code));
      await enrolled(recoveryCodes);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function addKey(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const name = keyName.trim();
    if (!name) {
      setError("Give the security key a name.");
      return;
    }
    setBusy(true);
    try {
      const { recoveryCodes } = await registerSecurityKey(name.slice(0, 64));
      await enrolled(recoveryCodes);
    } catch (err) {
      setError(securityKeyErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    setStep({ kind: "choose" });
    setBusy(true);
    try {
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  if (step.kind === "codes") {
    return <RecoveryCodes email={email} codes={step.codes} onDone={finish} />;
  }

  const heading = (
    <div>
      <h1 className="text-xl font-semibold">Set up two-step login</h1>
      <p className="mt-1 text-sm text-muted">
        Every account needs a second step besides the master password, so a stolen password alone
        can't open your vault.
      </p>
    </div>
  );

  if (step.kind === "totp") {
    return (
      <form onSubmit={confirmTotp} className="flex flex-col gap-4" noValidate>
        {heading}
        {error && <Alert tone="error">{error}</Alert>}
        <ol className="list-decimal space-y-1 pl-5 text-sm">
          <li>Open an authenticator app on your phone (any TOTP app works).</li>
          <li>Scan this QR code, or enter the key by hand.</li>
          <li>Type the 6-digit code it shows.</li>
        </ol>
        <img
          src={step.qr}
          alt="QR code for your authenticator app"
          width={192}
          height={192}
          className="mx-auto rounded-md bg-white p-1"
        />
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium">Setup key</span>
          <output className="rounded-md border border-line bg-bg p-2 text-center font-mono text-sm break-all select-all">
            {groupSecret(step.setup.secret)}
          </output>
        </div>
        <Field
          label="6-digit code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={7}
          required
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        <Button type="submit" busy={busy && "Checking…"}>
          Turn on
        </Button>
        <Button variant="link" onClick={back}>
          Use a different method
        </Button>
      </form>
    );
  }

  if (step.kind === "key") {
    return (
      <form onSubmit={addKey} className="flex flex-col gap-4" noValidate>
        {heading}
        {error && <Alert tone="error">{error}</Alert>}
        <p className="text-sm">
          Use a USB or NFC security key, or this device's built-in one (Windows Hello, Touch ID).
          Your browser will ask you to touch or unlock it.
        </p>
        <Field
          label="Name"
          maxLength={64}
          required
          value={keyName}
          onChange={(e) => setKeyName(e.target.value)}
          hint="So you can tell your keys apart later."
        />
        <Button type="submit" busy={busy && "Waiting for your security key…"}>
          Add security key
        </Button>
        <Button variant="link" onClick={back}>
          Use a different method
        </Button>
      </form>
    );
  }

  const webauthn = browserSupportsWebAuthn();
  return (
    <div className="flex flex-col gap-4">
      {heading}
      {error && <Alert tone="error">{error}</Alert>}
      <Button onClick={startTotp} busy={busy && "Preparing…"}>
        Authenticator app
      </Button>
      <Button
        variant="secondary"
        className="w-full"
        disabled={busy || !webauthn}
        onClick={() => {
          setError(null);
          setStep({ kind: "key" });
        }}
      >
        Security key or Windows Hello
      </Button>
      {!webauthn && (
        <p className="text-xs text-muted">This browser doesn't support security keys.</p>
      )}
      <p className="text-xs text-muted">You can add more methods later in Settings → Security.</p>
    </div>
  );
}
