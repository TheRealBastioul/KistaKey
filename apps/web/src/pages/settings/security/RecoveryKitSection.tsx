// Settings → Security → Recovery kit: a new recovery key for the unlocked
// account; the old one stops working. The master password is asked again
// (its authKey authorizes the change); the new key is made in the worker
// from the user key in keyStore and shown once.
import { RotateRecoveryKeyRequestSchema } from "@repo/types";
import { type FormEvent, useState } from "react";
import { authApi } from "../../../api/auth";
import { errorMessage } from "../../../api/client";
import { useAuth } from "../../../auth/AuthProvider";
import { keyStore } from "../../../auth/keyStore";
import { RecoveryKit } from "../../../components/RecoveryKit";
import { Alert, Button, Field } from "../../../components/ui";
import { cryptoClient } from "../../../crypto/client";
import { Section } from "../Section";

export function RecoveryKitSection() {
  const { state } = useAuth();
  const session = state.status === "session" ? state.session : null;
  const email = session?.user.email ?? "";
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recoveryKey, setRecoveryKey] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const keys = session?.keys;
    const userKey = keyStore.get();
    if (!keys || !userKey) {
      setError("Unlock your vault first.");
      return;
    }
    if (!password) {
      setError("Enter your master password.");
      return;
    }
    setBusy(true);
    try {
      const login = await cryptoClient.call("deriveLoginKeys", password, keys.kdfSalt, keys.kdf);
      login.encKey.fill(0);
      // The worker gets a copy of the user key (structured clone) and wipes it.
      const rotated = await cryptoClient.call("rotateRecoveryKey", userKey);
      await authApi.rotateRecoveryKey(
        RotateRecoveryKeyRequestSchema.parse({ ...rotated.material, authKey: login.authKey }),
      );
      setPassword("");
      setRecoveryKey(rotated.recoveryKey);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function close() {
    setOpen(false);
    setPassword("");
    setError(null);
    setRecoveryKey(null);
  }

  return (
    <Section
      title="Recovery kit"
      description="Your way back in if you forget your master password. Make a new one if the old kit was lost or seen by someone else."
    >
      {recoveryKey ? (
        <RecoveryKit
          email={email}
          recoveryKey={recoveryKey}
          title="Your new recovery kit"
          intro={<Alert tone="success">Your old recovery key no longer works.</Alert>}
          doneLabel="Done"
          onDone={close}
        />
      ) : open ? (
        <form onSubmit={onSubmit} className="flex max-w-md flex-col gap-4" noValidate>
          {error && <Alert tone="error">{error}</Alert>}
          <input type="email" autoComplete="username" value={email} readOnly hidden />
          <Field
            label="Master password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            hint="Your current recovery key stops working once the new one is made."
          />
          <Button type="submit" busy={busy && "Making a new kit…"}>
            Make new recovery kit
          </Button>
          <Button variant="link" onClick={close}>
            Cancel
          </Button>
        </form>
      ) : (
        <div>
          <Button variant="secondary" onClick={() => setOpen(true)}>
            Make a new recovery kit
          </Button>
        </div>
      )}
    </Section>
  );
}
