// Right pane for /vault/:itemId: the item's fields with Show / Copy, the
// live TOTP code, password history, trash actions (move to trash, restore,
// delete now), Edit (editor/ItemEditor.tsx), and the favorite star and
// folder picker, which save at once (last write wins, decisions §18).
import { type TotpConfig, VAULT_RETENTION } from "@repo/types";
import { type ReactNode, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { errorMessage } from "../../api/client";
import { safeHref } from "../../components/markdownParser";
import { Alert, Button } from "../../components/ui";
import type { FolderEntry, VaultEntry } from "../../vault/store";
import { useReveal } from "../../vault/useReveal";
import { useTotp } from "../../vault/useTotp";
import { ItemConflict, useVault, vaultActions, vaultStore } from "../../vault/useVault";
import { ConfirmButton, formatDate } from "../settings/Section";
import { CopyButton, FieldRow } from "./FieldRow";
import { TYPE_LABELS } from "./Sidebar";
import { useVaultParams } from "./useVaultParams";

const DAY_MS = 24 * 60 * 60 * 1000;

/** A link for a stored URI: absolute http(s) as is, a bare host gets https://. */
function uriHref(uri: string): string | null {
  const href = /^[a-z][a-z0-9+.-]*:/i.test(uri) ? safeHref(uri) : safeHref(`https://${uri}`);
  return href?.startsWith("http") ? href : null;
}

function Card({ children }: { children: ReactNode }) {
  return (
    <div className="divide-y divide-line rounded-lg border border-line bg-surface p-4">
      {children}
    </div>
  );
}

function TotpRow({ config, onUse }: { config: TotpConfig; onUse: () => void }) {
  const totp = useTotp(config);
  if (!totp) return null;
  const grouped = totp.code?.replace(/(\d{3})(?=\d)/g, "$1 ") ?? "··· ···";
  return (
    <div className="flex items-center justify-between gap-2 py-3 first:pt-0 last:pb-0">
      <div>
        <p className="text-xs text-muted">Authenticator code</p>
        {totp.failed ? (
          <p className="text-sm text-bad">This TOTP secret isn't valid.</p>
        ) : (
          <p className="font-mono text-lg tracking-wider" aria-live="polite">
            {grouped}
            <span
              className={`ml-3 text-xs ${totp.remaining <= 5 ? "text-bad" : "text-muted"}`}
              title="Seconds until the code changes"
            >
              {totp.remaining}s
            </span>
          </p>
        )}
      </div>
      {totp.code && <CopyButton value={totp.code} onCopied={onUse} />}
    </div>
  );
}

function ItemDetail({ entry, folders }: { entry: VaultEntry; folders: FolderEntry[] }) {
  const reveal = useReveal();
  const navigate = useNavigate();
  const { homeHref, editHref } = useVaultParams();
  const [busy, setBusy] = useState<string | false>(false);
  const [error, setError] = useState<string | null>(null);
  const data = entry.data;
  const login = data?.login;
  const use = () => vaultStore.markUsed(entry.id);

  async function run(label: string, action: () => Promise<unknown>, leave = false) {
    setBusy(label);
    setError(null);
    try {
      await action();
      if (leave) navigate(homeHref);
    } catch (err) {
      setError(err instanceof ItemConflict ? err.message : errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const purgeOn = entry.deletedAt
    ? new Date(Date.parse(entry.deletedAt) + VAULT_RETENTION.trashDays * DAY_MS).toISOString()
    : null;
  const editable = data !== null && entry.deletedAt === null;
  const folderName = entry.folderId
    ? (folders.find((f) => f.id === entry.folderId)?.name ?? null)
    : null;

  return (
    <article className="flex flex-col gap-4">
      <Link to={homeHref} className="text-sm text-accent lg:hidden">
        ← Back to the list
      </Link>

      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className={`text-xl font-semibold break-words ${data ? "" : "text-bad"}`}>
            {entry.name}
          </h1>
          <p className="text-sm text-muted">
            {TYPE_LABELS[entry.type]}
            {folderName && ` · ${folderName}`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {data && (
            <button
              type="button"
              disabled={!editable || busy !== false}
              aria-pressed={data.favorite}
              aria-label={data.favorite ? "Remove from favorites" : "Add to favorites"}
              title={data.favorite ? "Remove from favorites" : "Add to favorites"}
              onClick={() =>
                void run("favorite", () => vaultActions.setFavorite(entry, !data.favorite))
              }
              className={`rounded px-2 py-1 text-xl leading-none hover:bg-surface disabled:opacity-50 ${
                data.favorite ? "text-accent" : "text-muted"
              }`}
            >
              {data.favorite ? "★" : "☆"}
            </button>
          )}
          {editable && (
            <Link
              to={editHref(entry.id)}
              className="rounded-md border border-line bg-surface px-3 py-2 text-sm font-medium hover:bg-bg"
            >
              Edit
            </Link>
          )}
        </div>
      </header>

      {error && <Alert tone="error">{error}</Alert>}

      {entry.deletedAt && purgeOn && (
        <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4">
          <p className="text-sm">
            In the trash since {formatDate(entry.deletedAt)}. It's deleted for good on{" "}
            {formatDate(purgeOn)}.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              busy={busy === "restore" && "Restoring…"}
              onClick={() => void run("restore", () => vaultActions.restore(entry.id))}
            >
              Restore
            </Button>
            <ConfirmButton
              label="Delete now"
              question="Delete for good? This can't be undone."
              busy={busy === "purge" && "Deleting…"}
              onConfirm={() => void run("purge", () => vaultActions.purge(entry.id), true)}
            />
          </div>
        </div>
      )}

      {!data ? (
        <Alert tone="error">
          This item couldn't be decrypted. It may be damaged or from a newer version of the app.
        </Alert>
      ) : (
        <>
          {login && (
            <Card>
              {(entry.type === "login" || login.username) && (
                <FieldRow
                  label={entry.type === "totp" ? "Account" : "Username"}
                  value={login.username}
                  onUse={use}
                />
              )}
              {entry.type === "login" && (
                <FieldRow
                  label="Password"
                  value={login.password}
                  secret={{ reveal, field: "password" }}
                  onUse={use}
                />
              )}
              {login.totp && <TotpRow config={login.totp} onUse={use} />}
            </Card>
          )}

          {login && login.uris.length > 0 && (
            <Card>
              {login.uris.map((u, i) => {
                const href = uriHref(u.uri);
                return (
                  <FieldRow
                    // biome-ignore lint/suspicious/noArrayIndexKey: URIs have no id and may repeat
                    key={i}
                    label={i === 0 ? "Website" : `Website ${i + 1}`}
                    value={u.uri}
                    onUse={use}
                    actions={
                      href && (
                        <a
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer nofollow"
                          onClick={use}
                          className="rounded px-2 py-1 text-xs text-accent hover:bg-bg"
                        >
                          Open
                        </a>
                      )
                    }
                  />
                );
              })}
            </Card>
          )}

          {data.note !== undefined && data.note !== "" && (
            <Card>
              <FieldRow
                label={entry.type === "note" ? "Note" : "Notes"}
                value={data.note}
                multiline
                onUse={use}
              />
            </Card>
          )}

          {data.customFields.length > 0 && (
            <Card>
              {data.customFields.map((field) => (
                <FieldRow
                  key={field.id}
                  label={field.label}
                  value={field.value}
                  secret={field.hidden ? { reveal, field: `custom:${field.id}` } : undefined}
                  onUse={use}
                />
              ))}
            </Card>
          )}

          {data.passwordHistory.length > 0 && (
            <details className="rounded-lg border border-line bg-surface p-4">
              <summary className="cursor-pointer text-sm font-medium">
                Password history ({data.passwordHistory.length})
              </summary>
              <div className="mt-3 divide-y divide-line">
                {data.passwordHistory.map((past, i) => (
                  <FieldRow
                    // biome-ignore lint/suspicious/noArrayIndexKey: history is ordered and has no id
                    key={i}
                    label={`Changed ${formatDate(past.changedAt)}`}
                    value={past.password}
                    secret={{ reveal, field: `history:${i}` }}
                    onUse={use}
                  />
                ))}
              </div>
            </details>
          )}
        </>
      )}

      <footer className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted">
        <span>
          Updated {formatDate(entry.updatedAt)} · created {formatDate(entry.createdAt)}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          {editable && (
            <label className="flex items-center gap-2">
              Folder
              <select
                value={entry.folderId ?? ""}
                disabled={busy !== false}
                onChange={(e) =>
                  void run("move", () => vaultActions.moveToFolder(entry, e.target.value || null))
                }
                className="rounded-md border border-line bg-bg px-2 py-1.5 text-sm text-fg"
              >
                <option value="">No folder</option>
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name ?? "Unreadable folder"}
                  </option>
                ))}
              </select>
            </label>
          )}
          {!entry.deletedAt && (
            <Button
              variant="secondary"
              busy={busy === "trash" && "Moving…"}
              onClick={() => void run("trash", () => vaultActions.trash(entry.id))}
            >
              Move to trash
            </Button>
          )}
        </div>
      </footer>
    </article>
  );
}

/** Looks the item up in the store; keyed by id so reveals reset per item. */
export function ItemRoute() {
  const { itemId } = useParams();
  const vault = useVault();
  const { homeHref } = useVaultParams();
  const entry = vault.items.find((e) => e.id === itemId);

  if (!entry) {
    return (
      <div className="flex flex-col gap-2 text-sm">
        <p>This item doesn't exist anymore.</p>
        <Link to={homeHref} className="text-accent">
          Back to the vault
        </Link>
      </div>
    );
  }
  return <ItemDetail key={entry.id} entry={entry} folders={vault.folders} />;
}
