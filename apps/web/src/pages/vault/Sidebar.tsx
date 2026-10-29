// Left pane: filters (all, favorites, types), folders with create / rename /
// delete, and the trash. Deleting a folder moves its items to "No folder".
import { FolderNameSchema, type ItemType } from "@repo/types";
import { type FormEvent, type ReactNode, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { errorMessage } from "../../api/client";
import { Button } from "../../components/ui";
import { countItems, filterParam, type VaultFilter } from "../../vault/search";
import type { FolderEntry } from "../../vault/store";
import { useVault, vaultActions } from "../../vault/useVault";
import { ConfirmButton } from "../settings/Section";
import { useVaultParams } from "./useVaultParams";

export const TYPE_LABELS: Record<ItemType, string> = {
  login: "Logins",
  note: "Secure notes",
  totp: "Authenticator codes",
};

const UNNAMED_FOLDER = "Unreadable folder";

function FilterLink({
  filter,
  label,
  count,
}: {
  filter: VaultFilter;
  label: string;
  count: number;
}) {
  const params = useVaultParams();
  const active = filterParam(params.filter) === filterParam(filter);
  return (
    <Link
      to={params.filterHref(filter)}
      aria-current={active ? "page" : undefined}
      className={`flex items-center justify-between rounded-md px-3 py-1.5 text-sm ${
        active ? "bg-accent text-accent-fg" : "text-fg hover:bg-surface"
      }`}
    >
      <span className="truncate">{label}</span>
      <span className={`text-xs ${active ? "" : "text-muted"}`}>{count}</span>
    </Link>
  );
}

function Heading({ children, action }: { children: string; action?: ReactNode }) {
  return (
    <div className="mt-4 mb-1 flex items-center justify-between px-3">
      <h2 className="text-xs font-semibold tracking-wide text-muted uppercase">{children}</h2>
      {action}
    </div>
  );
}

/** Inline name input for a new or renamed folder. */
function FolderNameForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
  extra,
}: {
  initial: string;
  submitLabel: string;
  onSubmit: (name: string) => Promise<void>;
  onCancel: () => void;
  extra?: ReactNode;
}) {
  const [name, setName] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = FolderNameSchema.safeParse(name);
    if (!parsed.success) {
      setError("Enter a name of up to 128 characters.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSubmit(parsed.data);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-2 rounded-md border border-line bg-surface p-2"
    >
      <input
        // biome-ignore lint/a11y/noAutofocus: the user just asked for this input
        autoFocus
        aria-label="Folder name"
        value={name}
        maxLength={128}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onCancel();
        }}
        className="rounded-md border border-line bg-bg px-2 py-1 text-sm outline-none focus:border-accent"
      />
      {error && <p className="text-xs text-bad">{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" variant="secondary" busy={busy && "Saving…"}>
          {submitLabel}
        </Button>
        <Button variant="link" onClick={onCancel}>
          Cancel
        </Button>
        {extra}
      </div>
    </form>
  );
}

function FolderItem({ folder, count }: { folder: FolderEntry; count: number }) {
  const params = useVaultParams();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const filter: VaultFilter = { kind: "folder", folderId: folder.id };

  async function remove() {
    setDeleting(true);
    setError(null);
    try {
      const wasOpen = filterParam(params.filter) === filterParam(filter);
      await vaultActions.deleteFolder(folder.id);
      if (wasOpen) navigate(params.filterHref({ kind: "all" }));
    } catch (err) {
      setError(errorMessage(err));
      setDeleting(false);
    }
  }

  if (editing) {
    return (
      <li>
        <FolderNameForm
          initial={folder.name ?? ""}
          submitLabel="Rename"
          onSubmit={async (name) => {
            await vaultActions.renameFolder(folder.id, name);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
          extra={
            <ConfirmButton
              label="Delete"
              question="Delete folder? Items stay."
              busy={deleting && "Deleting…"}
              onConfirm={() => void remove()}
            />
          }
        />
        {error && <p className="px-3 text-xs text-bad">{error}</p>}
      </li>
    );
  }
  return (
    <li className="group flex items-center gap-1">
      <div className="min-w-0 flex-1">
        <FilterLink filter={filter} label={folder.name ?? UNNAMED_FOLDER} count={count} />
      </div>
      <button
        type="button"
        onClick={() => setEditing(true)}
        aria-label={`Edit folder ${folder.name ?? ""}`}
        className="rounded px-1.5 text-xs text-muted opacity-0 group-hover:opacity-100 hover:text-fg focus:opacity-100"
      >
        Edit
      </button>
    </li>
  );
}

export function Sidebar() {
  const vault = useVault();
  const counts = useMemo(() => countItems(vault.items), [vault.items]);
  const [creating, setCreating] = useState(false);

  return (
    <nav aria-label="Vault filters" className="flex flex-col">
      <ul className="flex flex-col gap-0.5">
        <li>
          <FilterLink filter={{ kind: "all" }} label="All items" count={counts.all} />
        </li>
        <li>
          <FilterLink filter={{ kind: "favorites" }} label="Favorites" count={counts.favorites} />
        </li>
      </ul>

      <Heading>Types</Heading>
      <ul className="flex flex-col gap-0.5">
        {(Object.keys(TYPE_LABELS) as ItemType[]).map((type) => (
          <li key={type}>
            <FilterLink
              filter={{ kind: "type", type }}
              label={TYPE_LABELS[type]}
              count={counts.type[type]}
            />
          </li>
        ))}
      </ul>

      <Heading
        action={
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="text-xs text-accent hover:underline"
          >
            New
          </button>
        }
      >
        Folders
      </Heading>
      <ul className="flex flex-col gap-0.5">
        {creating && (
          <li>
            <FolderNameForm
              initial=""
              submitLabel="Create"
              onSubmit={async (name) => {
                await vaultActions.createFolder(name);
                setCreating(false);
              }}
              onCancel={() => setCreating(false)}
            />
          </li>
        )}
        {vault.folders.map((folder) => (
          <FolderItem key={folder.id} folder={folder} count={counts.folder.get(folder.id) ?? 0} />
        ))}
        <li>
          <FilterLink
            filter={{ kind: "folder", folderId: null }}
            label="No folder"
            count={counts.folder.get(null) ?? 0}
          />
        </li>
      </ul>

      <div className="mt-4 border-t border-line pt-3">
        <FilterLink filter={{ kind: "trash" }} label="Trash" count={counts.trash} />
      </div>
    </nav>
  );
}
