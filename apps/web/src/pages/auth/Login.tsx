// Login: prelogin → derive keys in the worker → POST /auth/login. On
// success the guards move the user on (MFA, legal, MFA setup or the app).
import { EmailSchema } from "@repo/types";
import { type FormEvent, useState } from "react";
import { Link } from "react-router";
import { ApiError, errorMessage } from "../../api/client";
import { useAuth } from "../../auth/AuthProvider";
import { ResendVerification } from "../../components/ResendVerification";
import { Alert, Button, Field } from "../../components/ui";

export function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unverified, setUnverified] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setUnverified(null);
    const parsed = EmailSchema.safeParse(email);
    if (!parsed.success) {
      setError("Enter a valid email address.");
      return;
    }
    if (!password) {
      setError("Enter your master password.");
      return;
    }

    setBusy(true);
    try {
      await login(parsed.data, password);
      setPassword("");
    } catch (err) {
      if (err instanceof ApiError && err.code === "EMAIL_NOT_VERIFIED") {
        setUnverified(parsed.data);
      } else {
        setError(errorMessage(err));
      }
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <h1 className="text-xl font-semibold">Log in</h1>

      {error && <Alert tone="error">{error}</Alert>}

      {unverified && (
        <Alert tone="error">
          <div className="flex flex-col gap-2">
            <span>Verify your email first. Open the link we sent to {unverified}.</span>
            <ResendVerification email={unverified} />
          </div>
        </Alert>
      )}

      <Field
        label="Email"
        type="email"
        autoComplete="username"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />

      <Field
        label="Master password"
        type="password"
        autoComplete="current-password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />

      <Button type="submit" busy={busy && "Unlocking…"}>
        Log in
      </Button>

      <div className="flex justify-between text-sm">
        <Link to="/signup" className="text-accent hover:underline">
          Create an account
        </Link>
        <Link to="/recover" className="text-muted hover:text-fg hover:underline">
          Forgot master password?
        </Link>
      </div>
    </form>
  );
}
