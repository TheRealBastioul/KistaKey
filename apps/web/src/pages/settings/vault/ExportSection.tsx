// Export (decisions §21). Encrypted backup: the export document encrypted
// under the user key in the worker, re-importable into this account only.
// CSV: plaintext, behind a warning, an "I understand" box and the master
// password (checked locally). Both record `vault.exported` (format + count)
// first; if that fails, nothing is downloaded.
import { type FormEvent, useState } from "react";
import { errorMessage } from "../../../api/client";
import { vaultApi } from "../../../api/vault";
import { useAuth } from "../../../auth/AuthProvider";
import { Alert, Button, Field } from "../../../components/ui";
import { APP_NAME } from "../../../config";
import { isDecryptionFailure } from "../../../crypto/client";
import { downloadText } from "../../../lib/saveText";
import {
  encryptedExportFile,
  exportCsv,
  exportDocument,
  exportFileName,
  selectForExport,
} from "../../../vault/export";
import { useVault, vaultActions } from "../../../vault/useVault";
import { Section } from "../Section";

export function ExportSection() {
  const vault = useVault();
  const { verifyPassword } = useAuth();
  const [busy, setBusy] = useState<"json" | "csv" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [csvOpen, setCsvOpen] = useState(false);
  const [understood, setUnderstood] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const selection = selectForExport(vault.items, vault.folders);
  const count = selection.items.length;

  async function exportEncrypted() {
    setBusy("json");
    setError(null);
    setDone(null);
    try {
      const doc = JSON.stringify(exportDocument(selection));
      const blob = await vaultActions.encryptExport(doc);
      await vaultApi.recordExport({ format: "encrypted_json", itemCount: count });
      downloadText(
        exportFileName(APP_NAME, "encrypted.json"),
        JSON.stringify(encryptedExportFile(blob), null, 2),
        "application/json",
      );
      setDone(`Encrypted backup of ${count} items downloaded.`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function exportPlainCsv(event: FormEvent) {
    event.preventDefault();
    setBusy("csv");
    setError(null);
    setDone(null);
    setPasswordError(null);
    try {
      await verifyPassword(password);
    } catch (err) {
      setBusy(null);
      if (isDecryptionFailure(err)) setPasswordError("That's not your master password.");
      else setError(errorMessage(err));
      return;
    }
    try {
      await vaultApi.recordExport({ format: "csv", itemCount: count });
      downloadText(exportFileName(APP_NAME, "csv"), exportCsv(selection), "text/csv;charset=utf-8");
      setDone(`CSV with ${count} items downloaded. Delete it once you're done with it.`);
      setCsvOpen(false);
      setUnderstood(false);
      setPassword("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Section
      title="Export"
      description={`${count} ${count === 1 ? "item" : "items"} (trash not included).`}
    >
      {selection.unreadable > 0 && (
        <Alert tone="info">
          {selection.unreadable} unreadable {selection.unreadable === 1 ? "item is" : "items are"}{" "}
          left out.
        </Alert>
      )}
      {error && <Alert tone="error">{error}</Alert>}
      {done && <Alert tone="success">{done}</Alert>}

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">Encrypted backup (.json)</h3>
        <p className="text-sm text-muted">
          Encrypted with your account's key: only this account can import it again (Import →
          Encrypted backup). Not readable by other apps.
        </p>
        <Button
          variant="secondary"
          className="self-start"
          disabled={count === 0 || busy !== null}
          busy={busy === "json" && "Encrypting…"}
          onClick={() => void exportEncrypted()}
        >
          Download encrypted backup
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">Unencrypted CSV</h3>
        {!csvOpen ? (
          <Button
            variant="secondary"
            className="self-start"
            disabled={count === 0 || busy !== null}
            onClick={() => setCsvOpen(true)}
          >
            Export as CSV…
          </Button>
        ) : (
          <form className="flex max-w-md flex-col gap-3" onSubmit={exportPlainCsv}>
            <Alert tone="error">
              The CSV contains every password, note and authenticator key in plain text. Anyone or
              any program that can read the file can read your vault. Use it only to move to another
              app, and delete it right after.
            </Alert>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={understood}
                onChange={(e) => setUnderstood(e.target.checked)}
              />
              I understand the file won't be protected
            </label>
            <Field
              label="Master password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              {...(passwordError ? { error: passwordError } : {})}
              onChange={(e) => setPassword(e.target.value)}
            />
            <div className="flex flex-wrap gap-3">
              <Button
                type="submit"
                disabled={!understood || !password || busy !== null}
                busy={busy === "csv" && "Checking…"}
              >
                Download CSV
              </Button>
              <Button
                variant="link"
                onClick={() => {
                  setCsvOpen(false);
                  setUnderstood(false);
                  setPassword("");
                  setPasswordError(null);
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        )}
      </div>
    </Section>
  );
}
