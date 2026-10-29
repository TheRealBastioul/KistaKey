// Shows a freshly generated recovery key once (signup, account recovery;
// "regenerate recovery kit" later). The kit file is built here, in the
// browser, as plain text; nothing about it goes to the server. The parent
// drops the key from its state in onDone.
import { type ReactNode, useState } from "react";
import { APP_NAME } from "../config";
import { downloadText, printText, textFileName } from "../lib/saveText";
import { Alert, Button } from "./ui";

function kitText(email: string, recoveryKey: string): string {
  return [
    `${APP_NAME} recovery kit`,
    "",
    `Account: ${email}`,
    `Created: ${new Date().toISOString().slice(0, 10)}`,
    "",
    "Recovery key:",
    recoveryKey,
    "",
    "If you forget your master password, this key is the only way back into",
    "your account. We can't reset it for you: your vault is encrypted with keys",
    "we never see.",
    "",
    "Keep it somewhere safe and offline (printed, in a safe place). Anyone with",
    "this key and access to your email can take over your account.",
    "",
  ].join("\n");
}

interface RecoveryKitProps {
  email: string;
  recoveryKey: string;
  onDone: () => void;
  doneLabel?: string;
  title?: string;
  /** Extra text above the key (e.g. "your old key no longer works"). */
  intro?: ReactNode;
}

export function RecoveryKit({
  email,
  recoveryKey,
  onDone,
  doneLabel = "Continue",
  title = "Save your recovery kit",
  intro,
}: RecoveryKitProps) {
  const [saved, setSaved] = useState(false);
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="mt-1 text-sm text-muted">
          This key is the only way back in if you forget your master password. It's shown once.
        </p>
      </div>

      {intro}

      <output className="block rounded-md border border-line bg-bg p-3 text-center font-mono text-sm break-all select-all">
        {recoveryKey}
      </output>

      <div className="flex gap-2">
        <Button
          variant="secondary"
          onClick={() => downloadText(textFileName("recovery-kit"), kitText(email, recoveryKey))}
        >
          Download .txt
        </Button>
        <Button variant="secondary" onClick={() => printText(kitText(email, recoveryKey))}>
          Print
        </Button>
      </div>

      <Alert>Store it offline. We can't recover your vault without it or your password.</Alert>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={saved}
          onChange={(e) => setSaved(e.target.checked)}
          className="mt-0.5"
        />
        I've saved my recovery kit somewhere safe.
      </label>

      <Button disabled={!saved} onClick={onDone}>
        {doneLabel}
      </Button>
    </div>
  );
}
