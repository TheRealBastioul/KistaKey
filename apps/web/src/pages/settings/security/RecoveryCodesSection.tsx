// Settings → Security → Recovery codes: how many are left; regenerating
// replaces every old code and shows the new ones once.
import type { MfaOverviewResponse } from "@repo/types";
import { useState } from "react";
import { mfaApi } from "../../../api/auth";
import { errorMessage } from "../../../api/client";
import { RecoveryCodes } from "../../../components/RecoveryCodes";
import { Alert } from "../../../components/ui";
import { ConfirmButton, Section } from "../Section";

interface Props {
  email: string;
  overview: MfaOverviewResponse | null;
  onChanged: () => Promise<void>;
}

export function RecoveryCodesSection({ email, overview, onChanged }: Props) {
  const [codes, setCodes] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function regenerate() {
    setError(null);
    setBusy(true);
    try {
      setCodes((await mfaApi.regenerateRecoveryCodes()).recoveryCodes);
      await onChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const remaining = overview?.recoveryCodesRemaining;

  return (
    <Section
      title="Recovery codes"
      description="One-time codes for logging in when your phone or security key isn't at hand."
    >
      {error && <Alert tone="error">{error}</Alert>}
      {codes ? (
        <RecoveryCodes email={email} codes={codes} doneLabel="Done" onDone={() => setCodes(null)} />
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm">
            {remaining === undefined
              ? "Loading…"
              : `${remaining} unused code${remaining === 1 ? "" : "s"} left.`}
            {remaining !== undefined && remaining <= 3 && (
              <span className="text-bad"> Generate new ones soon.</span>
            )}
          </p>
          <ConfirmButton
            label="Generate new codes"
            question="Old codes stop working."
            confirmLabel="Generate"
            busy={busy && "Generating…"}
            onConfirm={() => void regenerate()}
          />
        </div>
      )}
    </Section>
  );
}
