import { useEffect, useState } from "react";
import { authApi } from "../api/auth";
import { errorMessage } from "../api/client";
import { Button } from "./ui";

const COOLDOWN_S = 30;

/** "Resend the email" with a cooldown. The API always answers 200, so "sent" never reveals an account. */
export function ResendVerification({ email }: { email: string }) {
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(0);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  async function resend() {
    setBusy(true);
    setMessage(null);
    try {
      await authApi.resendVerification(email);
      setMessage("Sent. Check your inbox (and spam folder).");
      setWait(COOLDOWN_S);
    } catch (err) {
      setMessage(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        variant="secondary"
        onClick={() => void resend()}
        disabled={!email || wait > 0}
        busy={busy && "Sending…"}
      >
        {wait > 0 ? `Resend in ${wait}s` : "Resend verification email"}
      </Button>
      {message && (
        <p className="text-xs text-muted" role="status">
          {message}
        </p>
      )}
    </div>
  );
}
