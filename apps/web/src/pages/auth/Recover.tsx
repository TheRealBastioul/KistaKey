// Account recovery with the recovery kit. The recovery key is turned into
// keys in the crypto worker: the server gets only the recoveryAuthKey (to
// prove the key) and then new encrypted key material. Recovery doesn't log
// in and doesn't skip MFA: afterwards the user logs in with the new
// password and their second step.
import { EmailSchema, RecoverCompleteRequestSchema } from "@repo/types";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { authApi } from "../../api/auth";
import { ApiError, errorMessage } from "../../api/client";
import { estimateStrength } from "../../auth/passwordStrength";
import { RecoveryKit } from "../../components/RecoveryKit";
import { StrengthMeter } from "../../components/StrengthMeter";
import { Alert, Button, Field } from "../../components/ui";
import { MIN_PASSWORD_LENGTH } from "../../config";
import { cryptoClient, isDecryptionFailure } from "../../crypto/client";

/** What recover/start gave back; the wrap key itself is held in a ref. */
interface Started {
  email: string;
  recoveryToken: string;
  recoveryWrappedUserKey: string;
}

const WRONG_KEY = "Email or recovery key is incorrect.";

export function Recover() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [recoveryKey, setRecoveryKey] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [started, setStarted] = useState<Started | null>(null);
  const [kit, setKit] = useState<{ email: string; recoveryKey: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wrapKey = useRef<Uint8Array | null>(null);

  const dropWrapKey = () => {
    wrapKey.current?.fill(0);
    wrapKey.current = null;
  };

  // Leaving the page mid-flow wipes the recovery wrap key.
  useEffect(
    () => () => {
      wrapKey.current?.fill(0);
      wrapKey.current = null;
    },
    [],
  );

  const strength = useMemo(
    () => estimateStrength(password, started?.email ?? email),
    [password, started, email],
  );
  const mismatch = confirm.length > 0 && confirm !== password;

  function restart(message: string | null) {
    dropWrapKey();
    setStarted(null);
    setPassword("");
    setConfirm("");
    setError(message);
  }

  async function onStart(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const parsedEmail = EmailSchema.safeParse(email);
    if (!parsedEmail.success) {
      setError("Enter a valid email address.");
      return;
    }
    if (!recoveryKey.trim()) {
      setError("Enter the recovery key from your recovery kit.");
      return;
    }

    setBusy(true);
    try {
      const keys = await cryptoClient.call("startRecovery", recoveryKey);
      try {
        const res = await authApi.recoverStart(parsedEmail.data, keys.recoveryAuthKey);
        dropWrapKey();
        wrapKey.current = keys.wrapKey;
        setRecoveryKey("");
        setStarted({ email: parsedEmail.data, ...res });
      } catch (err) {
        keys.wrapKey.fill(0);
        throw err;
      }
    } catch (err) {
      // A malformed key fails in the worker; a wrong one is a 401 from the API.
      const wrong = isDecryptionFailure(err) || (err instanceof ApiError && err.status === 401);
      setError(wrong ? WRONG_KEY : errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function onComplete(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const key = wrapKey.current;
    if (!started || !key) {
      restart("Recovery expired. Start again with your recovery key.");
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

    setBusy(true);
    try {
      // The worker gets a copy of the wrap key; ours stays until the server accepts.
      const result = await cryptoClient.call(
        "completeRecovery",
        key,
        started.recoveryWrappedUserKey,
        password,
      );
      // Recovery doesn't log in, so the user key isn't needed here.
      result.userKey.fill(0);
      const body = { ...result.material, recoveryToken: started.recoveryToken };
      await authApi.recoverComplete(RecoverCompleteRequestSchema.parse(body));
      dropWrapKey();
      setPassword("");
      setConfirm("");
      setStarted(null);
      setKit({ email: started.email, recoveryKey: result.recoveryKey });
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) {
        restart(errorMessage(err));
      } else {
        setError(isDecryptionFailure(err) ? WRONG_KEY : errorMessage(err));
      }
    } finally {
      setBusy(false);
    }
  }

  if (kit) {
    return (
      <RecoveryKit
        email={kit.email}
        recoveryKey={kit.recoveryKey}
        title="Save your new recovery kit"
        doneLabel="Go to log in"
        intro={
          <Alert tone="success">
            Your master password is changed and every device was signed out. Your old recovery key
            no longer works. When you log in, you'll still need your second step (authenticator app,
            security key or a recovery code).
          </Alert>
        }
        onDone={() => {
          setKit(null);
          navigate("/login", { replace: true });
        }}
      />
    );
  }

  if (started) {
    return (
      <form onSubmit={onComplete} className="flex flex-col gap-4" noValidate>
        <div>
          <h1 className="text-xl font-semibold">Choose a new master password</h1>
          <p className="mt-1 text-sm text-muted">
            Recovery key accepted for <span className="font-medium text-fg">{started.email}</span>.
            Your vault stays as it is; only the password that unlocks it changes.
          </p>
        </div>

        {error && <Alert tone="error">{error}</Alert>}

        <input type="email" autoComplete="username" value={started.email} readOnly hidden />

        <Field
          label="New master password"
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
          label="Confirm new master password"
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          error={mismatch ? "The passwords don't match." : null}
        />

        <Button type="submit" busy={busy && "Re-encrypting your keys…"}>
          Set new password
        </Button>
        <Button variant="link" onClick={() => restart(null)}>
          Start over
        </Button>
      </form>
    );
  }

  return (
    <form onSubmit={onStart} className="flex flex-col gap-4" noValidate>
      <div>
        <h1 className="text-xl font-semibold">Recover your account</h1>
        <p className="mt-1 text-sm text-muted">
          Forgot your master password? Use the recovery key from the kit you saved when you signed
          up. We can't reset your password for you.
        </p>
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      <Field
        label="Email"
        type="email"
        autoComplete="username"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />

      <Field
        label="Recovery key"
        autoComplete="off"
        spellCheck={false}
        required
        value={recoveryKey}
        onChange={(e) => setRecoveryKey(e.target.value)}
        className="font-mono"
        hint="Dashes and spaces don't matter."
      />

      <Button type="submit" busy={busy && "Checking your recovery key…"}>
        Continue
      </Button>

      <p className="text-center text-sm text-muted">
        Remembered it?{" "}
        <Link to="/login" className="text-accent hover:underline">
          Log in
        </Link>
      </p>
    </form>
  );
}
