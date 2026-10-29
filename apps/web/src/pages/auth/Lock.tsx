// Lock screen: the session is still valid, only the key is gone (reload or
// auto-lock). Unlocking is local: re-derive from the session's key material,
// no server call. A wrong password simply fails to decrypt the user key.
import { type FormEvent, useState } from "react";
import { useAuth } from "../../auth/AuthProvider";
import { Alert, Button, Field } from "../../components/ui";
import { isDecryptionFailure } from "../../crypto/client";

export function Lock() {
  const { state, unlock } = useAuth();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const email = state.status === "session" ? state.session.user.email : "";

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!password) return;
    setError(null);
    setBusy(true);
    try {
      await unlock(password);
      setPassword("");
    } catch (err) {
      setError(isDecryptionFailure(err) ? "Wrong master password." : "Couldn't unlock. Try again.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">Vault locked</h1>
        <p className="mt-1 text-sm text-muted">
          Enter your master password to unlock <span className="font-medium text-fg">{email}</span>.
        </p>
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      {/* Hidden username so password managers match the right account. */}
      <input type="email" autoComplete="username" value={email} readOnly hidden />

      <Field
        label="Master password"
        type="password"
        autoComplete="current-password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />

      <Button type="submit" busy={busy && "Unlocking…"}>
        Unlock
      </Button>
    </form>
  );
}
