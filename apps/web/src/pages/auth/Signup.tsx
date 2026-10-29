// Signup: every key is created in the crypto worker; the server gets only
// the authKey and encrypted key material. Signup doesn't log in: after the
// recovery kit, the user verifies their email and then logs in.
import { EmailSchema, type LegalAcceptance, SignupRequestSchema } from "@repo/types";
import { type FormEvent, Fragment, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { authApi } from "../../api/auth";
import { errorMessage } from "../../api/client";
import { estimateStrength } from "../../auth/passwordStrength";
import { RecoveryKit } from "../../components/RecoveryKit";
import { StrengthMeter } from "../../components/StrengthMeter";
import { Alert, Button, Field } from "../../components/ui";
import { MIN_PASSWORD_LENGTH } from "../../config";
import { cryptoClient } from "../../crypto/client";
import { useLegalDocuments } from "../../legal/useLegalDocuments";

export function Signup() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [agreed, setAgreed] = useState(false);
  const { documents, error: legalError } = useLegalDocuments();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [kit, setKit] = useState<{ email: string; recoveryKey: string } | null>(null);

  const strength = useMemo(() => estimateStrength(password, email), [password, email]);
  const mismatch = confirm.length > 0 && confirm !== password;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const parsedEmail = EmailSchema.safeParse(email);
    if (!parsedEmail.success) {
      setError("Enter a valid email address.");
      return;
    }
    if (!strength.meetsMinimum) {
      setError(`Your master password needs at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (confirm !== password) {
      setError("The passwords don't match.");
      return;
    }
    if (!documents || !agreed) {
      setError("Please accept the terms to continue.");
      return;
    }

    setBusy(true);
    try {
      const { material, recoveryKey } = await cryptoClient.call("createAccount", password);
      const acceptedLegal: LegalAcceptance[] = documents.map((d) => ({
        key: d.key,
        version: d.version,
      }));
      // Parsing narrows @repo/crypto's KdfParams to the contract's (and checks the bounds).
      const body = { ...material, email: parsedEmail.data, acceptedLegal };
      await authApi.signup(SignupRequestSchema.parse(body));
      setPassword("");
      setConfirm("");
      setKit({ email: parsedEmail.data, recoveryKey });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (kit) {
    return (
      <RecoveryKit
        email={kit.email}
        recoveryKey={kit.recoveryKey}
        onDone={() => {
          const sentTo = kit.email;
          setKit(null);
          navigate("/check-email", { state: { email: sentTo } });
        }}
      />
    );
  }

  // "the Terms of Service and Privacy Policy", each linking to its page (new tab).
  const docLinks = documents?.map((d, i, all) => (
    <Fragment key={d.key}>
      {i > 0 && (i === all.length - 1 ? " and " : ", ")}
      <Link
        to={`/legal/${d.key}`}
        target="_blank"
        rel="noopener"
        className="text-accent hover:underline"
      >
        {d.title}
      </Link>
    </Fragment>
  ));

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <div>
        <h1 className="text-xl font-semibold">Create your account</h1>
        <p className="mt-1 text-sm text-muted">
          Your master password encrypts your vault on this device. We never see it and can't reset
          it.
        </p>
      </div>

      {(error ?? legalError) && <Alert tone="error">{error ?? legalError}</Alert>}

      <Field
        label="Email"
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />

      <Field
        label="Master password"
        type="password"
        autoComplete="new-password"
        required
        minLength={MIN_PASSWORD_LENGTH}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        hint={`At least ${MIN_PASSWORD_LENGTH} characters. A few random words work well.`}
      >
        {password && <StrengthMeter strength={strength} />}
      </Field>

      <Field
        label="Confirm master password"
        type="password"
        autoComplete="new-password"
        required
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        error={mismatch ? "The passwords don't match." : null}
      />

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          disabled={!documents}
          className="mt-0.5"
        />
        <span>I agree to the {docLinks ?? "Terms of Service and Privacy Policy"}.</span>
      </label>

      <Button type="submit" busy={busy && "Creating your keys…"}>
        Create account
      </Button>

      <p className="text-center text-sm text-muted">
        Already have an account?{" "}
        <Link to="/login" className="text-accent hover:underline">
          Log in
        </Link>
      </p>
    </form>
  );
}
