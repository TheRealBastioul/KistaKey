// Settings → Security → Master password. The worker proves the current
// password locally (the user key must unwrap) and wraps the same user key
// under the new one; vault data doesn't change. The API signs out every
// other session. The session is re-read so the next unlock uses the new
// key material.
import { ChangePasswordRequestSchema } from "@repo/types";
import { type FormEvent, useMemo, useState } from "react";
import { authApi } from "../../../api/auth";
import { errorMessage } from "../../../api/client";
import { useAuth } from "../../../auth/AuthProvider";
import { estimateStrength } from "../../../auth/passwordStrength";
import { StrengthMeter } from "../../../components/StrengthMeter";
import { Alert, Button, Field } from "../../../components/ui";
import { MIN_PASSWORD_LENGTH } from "../../../config";
import { cryptoClient, isDecryptionFailure } from "../../../crypto/client";
import { Section } from "../Section";

/** `onChanged`: other sessions were signed out, so the session list is stale. */
export function MasterPasswordSection({ onChanged }: { onChanged: () => Promise<void> }) {
  const { state, refresh } = useAuth();
  const session = state.status === "session" ? state.session : null;
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const email = session?.user.email ?? "";
  const strength = useMemo(() => estimateStrength(next, email), [next, email]);
  const mismatch = confirm.length > 0 && confirm !== next;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setDone(false);
    const keys = session?.keys;
    if (!keys) {
      setError("Unlock your vault first.");
      return;
    }
    if (!current) {
      setError("Enter your current master password.");
      return;
    }
    if (!strength.meetsMinimum) {
      setError(`Your new master password needs at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (next !== confirm) {
      setError("The new passwords don't match.");
      return;
    }
    if (next === current) {
      setError("Choose a password different from the current one.");
      return;
    }

    setBusy(true);
    try {
      const result = await cryptoClient.call("changeMasterPassword", current, next, keys);
      // A copy of the key already in keyStore: not needed here.
      result.userKey.fill(0);
      await authApi.changePassword(
        ChangePasswordRequestSchema.parse({
          currentAuthKey: result.currentAuthKey,
          next: result.next,
        }),
      );
      await Promise.all([refresh(), onChanged()]);
      setCurrent("");
      setNext("");
      setConfirm("");
      setDone(true);
    } catch (err) {
      setError(
        isDecryptionFailure(err) ? "Current master password is incorrect." : errorMessage(err),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section
      title="Master password"
      description="Changing it signs you out everywhere else. Your recovery kit keeps working."
    >
      <form onSubmit={onSubmit} className="flex max-w-md flex-col gap-4" noValidate>
        {error && <Alert tone="error">{error}</Alert>}
        {done && (
          <Alert tone="success">Master password changed. Other sessions were signed out.</Alert>
        )}
        <input type="email" autoComplete="username" value={email} readOnly hidden />
        <Field
          label="Current master password"
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
        />
        <Field
          label="New master password"
          type="password"
          autoComplete="new-password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          hint={`At least ${MIN_PASSWORD_LENGTH} characters. A few random words work well.`}
        >
          {next && <StrengthMeter strength={strength} />}
        </Field>
        <Field
          label="Confirm new master password"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          error={mismatch ? "The passwords don't match." : null}
        />
        <Button type="submit" busy={busy && "Re-encrypting your keys…"}>
          Change master password
        </Button>
      </form>
    </Section>
  );
}
