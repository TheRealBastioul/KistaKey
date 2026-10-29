// Shows freshly issued MFA recovery codes once (first MFA method now;
// "regenerate codes" in Settings later). Download / print are built in the
// browser. The parent drops the codes from its state in onDone.
import { useState } from "react";
import { APP_NAME } from "../config";
import { downloadText, printText, textFileName } from "../lib/saveText";
import { Alert, Button } from "./ui";

function codesText(email: string, codes: string[]): string {
  return [
    `${APP_NAME} two-step login recovery codes`,
    "",
    `Account: ${email}`,
    `Created: ${new Date().toISOString().slice(0, 10)}`,
    "",
    ...codes,
    "",
    "Each code works once, in place of your authenticator app or security key.",
    "They don't replace your master password or your recovery kit.",
    "",
  ].join("\n");
}

interface RecoveryCodesProps {
  email: string;
  codes: string[];
  onDone: () => void;
  doneLabel?: string;
}

export function RecoveryCodes({
  email,
  codes,
  onDone,
  doneLabel = "Continue",
}: RecoveryCodesProps) {
  const [saved, setSaved] = useState(false);
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">Save your recovery codes</h1>
        <p className="mt-1 text-sm text-muted">
          If you lose your phone or security key, each code lets you log in once. They're shown
          once.
        </p>
      </div>

      <output className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-md border border-line bg-bg p-3 text-center font-mono text-sm select-all">
        {codes.map((code) => (
          <span key={code}>{code}</span>
        ))}
      </output>

      <div className="flex gap-2">
        <Button
          variant="secondary"
          onClick={() => downloadText(textFileName("recovery-codes"), codesText(email, codes))}
        >
          Download .txt
        </Button>
        <Button variant="secondary" onClick={() => printText(codesText(email, codes))}>
          Print
        </Button>
      </div>

      <Alert>Keep them apart from your recovery kit, for example in a different safe place.</Alert>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={saved}
          onChange={(e) => setSaved(e.target.checked)}
          className="mt-0.5"
        />
        I've saved my recovery codes.
      </label>

      <Button disabled={!saved} onClick={onDone}>
        {doneLabel}
      </Button>
    </div>
  );
}
