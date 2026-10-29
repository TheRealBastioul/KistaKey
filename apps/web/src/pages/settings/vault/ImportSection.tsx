// Import wizard: pick a format and file → parse in the browser → preview
// (counts, skipped rows, warnings) → encrypt in the worker and upload in
// batches with progress (decisions §21). Nothing is sent before "Import".
import { type ChangeEvent, useId, useState } from "react";
import { Link } from "react-router";
import { errorMessage } from "../../../api/client";
import { Alert, Button } from "../../../components/ui";
import { isDecryptionFailure } from "../../../crypto/client";
import { parseExportDocument, readEncryptedExportFile } from "../../../vault/export";
import {
  IMPORT_FORMATS,
  ImportFormatError,
  type ImportFormatId,
  type ImportProblem,
  type ParsedImport,
  parseImportFile,
  planImport,
  summarize,
} from "../../../vault/import";
import { useVault, vaultActions } from "../../../vault/useVault";
import { Section } from "../Section";

const MAX_FILE_BYTES = 50 * 1024 * 1024;
const SHOW_PROBLEMS = 20;

type Step =
  | { kind: "pick"; error: string | null; reading: boolean }
  | { kind: "preview"; parsed: ParsedImport; fileName: string }
  | { kind: "uploading"; done: number; total: number }
  | { kind: "done"; imported: number; total: number; error: string | null };

function Problems({ title, problems }: { title: string; problems: ImportProblem[] }) {
  if (problems.length === 0) return null;
  return (
    <details className="text-sm">
      <summary className="cursor-pointer">
        {title} ({problems.length})
      </summary>
      <ul className="mt-2 flex flex-col gap-1 text-muted">
        {problems.slice(0, SHOW_PROBLEMS).map((p, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static list, never reordered
          <li key={i}>
            <span className="text-fg">{p.where}</span>: {p.message}
          </li>
        ))}
        {problems.length > SHOW_PROBLEMS && <li>…and {problems.length - SHOW_PROBLEMS} more.</li>}
      </ul>
    </details>
  );
}

async function readFile(file: File, binary: boolean): Promise<string | Uint8Array> {
  return binary ? new Uint8Array(await file.arrayBuffer()) : file.text();
}

export function ImportSection() {
  const vault = useVault();
  const [formatId, setFormatId] = useState<ImportFormatId>("bitwarden_json");
  const [step, setStep] = useState<Step>({ kind: "pick", error: null, reading: false });
  const selectId = useId();
  const fileId = useId();
  const format = IMPORT_FORMATS.find((f) => f.id === formatId) ?? IMPORT_FORMATS[0];

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !format) return;
    const { id, binary } = format;
    if (file.size > MAX_FILE_BYTES) {
      setStep({ kind: "pick", error: "That file is too large (50 MB max).", reading: false });
      return;
    }
    setStep({ kind: "pick", error: null, reading: true });
    try {
      const content = await readFile(file, binary);
      let parsed: ParsedImport;
      if (id === "encrypted_export") {
        const blob = readEncryptedExportFile(String(content));
        parsed = parseExportDocument(await vaultActions.decryptExport(blob));
      } else {
        parsed = parseImportFile(id, content);
      }
      setStep({ kind: "preview", parsed, fileName: file.name });
    } catch (err) {
      const message =
        err instanceof ImportFormatError
          ? err.message
          : isDecryptionFailure(err)
            ? "This backup was made by another account (or is damaged), so it can't be opened here."
            : `Couldn't read that file: ${errorMessage(err)}`;
      setStep({ kind: "pick", error: message, reading: false });
    }
  }

  async function runImport(parsed: ParsedImport) {
    const chunks = planImport(parsed.items, vault.folders);
    const total = parsed.items.length;
    let done = 0;
    setStep({ kind: "uploading", done, total });
    try {
      await vaultActions.importChunks(formatId, chunks, (n) => {
        done = n;
        setStep({ kind: "uploading", done: n, total });
      });
      setStep({ kind: "done", imported: total, total, error: null });
    } catch (err) {
      setStep({ kind: "done", imported: done, total, error: errorMessage(err) });
    }
  }

  const reset = () => setStep({ kind: "pick", error: null, reading: false });

  return (
    <Section
      title="Import"
      description="Bring in items from another password manager. Files are read and encrypted in this browser; only encrypted items are uploaded."
    >
      {step.kind === "pick" && (
        <div className="flex flex-col gap-3">
          <label htmlFor={selectId} className="text-sm font-medium">
            Import from
          </label>
          <select
            id={selectId}
            value={formatId}
            onChange={(e) => setFormatId(e.target.value as ImportFormatId)}
            className="max-w-sm rounded-md border border-line bg-bg px-3 py-2 text-sm"
          >
            {IMPORT_FORMATS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
          <p className="text-sm text-muted">{format?.help}</p>
          <div>
            <label
              htmlFor={fileId}
              className="inline-flex cursor-pointer rounded-md border border-line px-3 py-2 text-sm hover:bg-bg"
            >
              {step.reading ? "Reading…" : "Choose file…"}
            </label>
            <input
              id={fileId}
              type="file"
              accept={format?.accept}
              className="sr-only"
              disabled={step.reading}
              onChange={onFile}
            />
          </div>
          {step.error && <Alert tone="error">{step.error}</Alert>}
          <p className="text-xs text-muted">
            Delete the export file from your computer once the import is done: it isn't encrypted.
          </p>
        </div>
      )}

      {step.kind === "preview" &&
        (() => {
          const s = summarize(step.parsed);
          return (
            <div className="flex flex-col gap-3">
              <p className="text-sm">
                <span className="font-medium">{step.fileName}</span>: {s.total}{" "}
                {s.total === 1 ? "item" : "items"} ready ({s.byType.login} logins, {s.byType.note}{" "}
                notes{s.byType.totp ? `, ${s.byType.totp} authenticator codes` : ""}) in {s.folders}{" "}
                {s.folders === 1 ? "folder" : "folders"}.
              </p>
              <Problems title="Skipped" problems={step.parsed.skipped} />
              <Problems title="Imported with changes" problems={step.parsed.warnings} />
              <p className="text-xs text-muted">
                Items are added next to what's already in your vault; nothing is overwritten.
                Folders with the same name are reused.
              </p>
              <div className="flex flex-wrap gap-3">
                <Button disabled={s.total === 0} onClick={() => void runImport(step.parsed)}>
                  Import {s.total} {s.total === 1 ? "item" : "items"}
                </Button>
                <Button variant="secondary" onClick={reset}>
                  Choose another file
                </Button>
              </div>
            </div>
          );
        })()}

      {step.kind === "uploading" && (
        <div className="flex flex-col gap-2">
          <p className="text-sm" aria-live="polite">
            Encrypting and uploading… {step.done} of {step.total}
          </p>
          <progress className="w-full" max={step.total} value={step.done} />
        </div>
      )}

      {step.kind === "done" && (
        <div className="flex flex-col gap-3">
          {step.error ? (
            <Alert tone="error">
              Imported {step.imported} of {step.total} items, then it failed: {step.error}. The
              imported ones are in your vault; to finish, import a file with only the rest.
            </Alert>
          ) : (
            <Alert tone="success">
              Imported {step.imported} {step.imported === 1 ? "item" : "items"}.
            </Alert>
          )}
          <div className="flex flex-wrap gap-3">
            <Link to="/vault" className="text-sm text-accent hover:underline">
              Open the vault
            </Link>
            <Button variant="link" onClick={reset}>
              Import another file
            </Button>
          </div>
        </div>
      )}
    </Section>
  );
}
