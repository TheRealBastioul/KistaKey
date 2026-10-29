// Legal gate (session step `legal`): one card per pending document, each with
// its own checkbox. Accepting re-reads the session; if a newer version was
// published meanwhile, the API answers 400 with `currentVersions` and the
// page reloads the documents and asks again.
import type { LegalAcceptance } from "@repo/types";
import { type FormEvent, useState } from "react";
import { Link } from "react-router";
import { legalApi } from "../../api/auth";
import { ApiError, errorMessage } from "../../api/client";
import { useAuth } from "../../auth/AuthProvider";
import { Markdown } from "../../components/Markdown";
import { Alert, Button } from "../../components/ui";
import { useLegalDocuments } from "../../legal/useLegalDocuments";

function isVersionConflict(err: unknown): boolean {
  return (
    err instanceof ApiError &&
    err.status === 400 &&
    typeof err.details === "object" &&
    err.details !== null &&
    "currentVersions" in err.details
  );
}

export function AcceptTerms() {
  const { state, refresh } = useAuth();
  const pending = state.status === "session" ? state.session.pendingLegal : [];
  const { documents, error: loadError, reload } = useLegalDocuments();
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const allChecked = pending.length > 0 && pending.every((p) => checked[p.key]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!allChecked) return;
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const accepted: LegalAcceptance[] = pending.map((p) => ({ key: p.key, version: p.version }));
      await legalApi.accept(accepted);
      // Now `ready` (or `mfa_setup`): the guard moves on; a pending login key unlocks.
      await refresh();
    } catch (err) {
      if (isVersionConflict(err)) {
        setChecked({});
        await Promise.all([refresh(), reload()]);
        setNotice("A document was updated while you were reading. Review it and accept again.");
      } else {
        setError(errorMessage(err));
      }
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">
          {pending.some((p) => !p.firstTime) ? "We've updated our terms" : "Review our terms"}
        </h1>
        <p className="mt-1 text-sm text-muted">Accept each document to continue.</p>
      </div>

      {notice && <Alert>{notice}</Alert>}
      {(error ?? loadError) && <Alert tone="error">{error ?? loadError}</Alert>}

      {pending.map((p) => {
        const doc = documents?.find((d) => d.key === p.key && d.version === p.version);
        return (
          <section key={p.key} className="flex flex-col gap-3 rounded-md border border-line p-4">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="font-semibold">{p.title}</h2>
              <Link
                to={`/legal/${p.key}`}
                target="_blank"
                rel="noopener"
                className="text-xs text-accent hover:underline"
              >
                Open in new tab
              </Link>
            </div>
            <div className="max-h-72 overflow-y-auto rounded-md border border-line bg-bg p-3">
              {doc ? (
                <Markdown source={doc.body} />
              ) : (
                <p className="text-sm text-muted">{documents ? "Couldn't load it." : "Loading…"}</p>
              )}
            </div>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={checked[p.key] ?? false}
                onChange={(e) => setChecked((c) => ({ ...c, [p.key]: e.target.checked }))}
                className="mt-0.5"
              />
              <span>
                I accept the {p.title} (version {p.version}).
              </span>
            </label>
          </section>
        );
      })}

      <Button type="submit" disabled={!allChecked} busy={busy && "Saving…"}>
        Accept and continue
      </Button>
    </form>
  );
}
