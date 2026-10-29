// Right pane for /vault/new?type= and /vault/:itemId/edit. One form for every
// type: name, favorite, folder; login: username, password (+ generator),
// websites; login/totp: authenticator key (QR upload or camera); notes;
// custom fields. The type is picked when creating and fixed after.
//
// Validation (VAULT_LIMITS) happens in vault/editorModel.ts before anything
// is encrypted. Edits save against the revision the editor opened with; a
// 409 opens the conflict dialog. Leaving with unsaved changes asks first.
import { ITEM_TYPES, type ItemData, type ItemType, VAULT_LIMITS } from "@repo/types";
import { type FormEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { Link, useBlocker, useNavigate, useParams, useSearchParams } from "react-router";
import { errorMessage } from "../../../api/client";
import { keyStore } from "../../../auth/keyStore";
import { Dialog } from "../../../components/Dialog";
import { Alert, Button, Field } from "../../../components/ui";
import {
  buildItemData,
  type DraftErrors,
  draftFromItem,
  emptyDraft,
  type ItemDraft,
} from "../../../vault/editorModel";
import type { VaultEntry } from "../../../vault/store";
import { prefillFromTotp } from "../../../vault/totpInput";
import { ItemConflict, useVault, vaultActions } from "../../../vault/useVault";
import { useVaultParams } from "../useVaultParams";
import { ConflictDialog } from "./ConflictDialog";
import { CustomFieldsEditor, UrisEditor } from "./FieldLists";
import { GeneratorPopover } from "./GeneratorPopover";
import { TotpField } from "./TotpField";

const TYPE_NAMES: Record<ItemType, string> = {
  login: "Login",
  note: "Secure note",
  totp: "Authenticator code",
};

const TEXTAREA =
  "min-h-28 rounded-md border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-accent";

function Card({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-4">
      {children}
    </div>
  );
}

function PasswordInput({
  value,
  error,
  onChange,
}: {
  value: string;
  error?: string;
  onChange: (value: string) => void;
}) {
  const [shown, setShown] = useState(false);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-end gap-2">
        <Field
          label="Password"
          className="flex-1"
          type={shown ? "text" : "password"}
          autoComplete="new-password"
          spellCheck={false}
          value={value}
          maxLength={VAULT_LIMITS.passwordChars}
          error={error}
          onChange={(e) => onChange(e.target.value)}
        />
        <div className="flex gap-2 pb-px">
          <Button variant="secondary" aria-pressed={shown} onClick={() => setShown(!shown)}>
            {shown ? "Hide" : "Show"}
          </Button>
          <GeneratorPopover
            onUse={(generated) => {
              onChange(generated);
              setShown(true);
            }}
          />
        </div>
      </div>
    </div>
  );
}

type Mode =
  | { kind: "new"; type: ItemType }
  | { kind: "edit"; entry: VaultEntry & { data: ItemData } };

function ItemEditor({ mode, initialFolder }: { mode: Mode; initialFolder: string | null }) {
  const vault = useVault();
  const navigate = useNavigate();
  const { itemHref, homeHref } = useVaultParams();
  // The version editing started from; saves send its revision.
  const [base] = useState(mode.kind === "edit" ? mode.entry : null);
  const [initial] = useState(() =>
    base
      ? draftFromItem(base.type, base.folderId, base.data)
      : emptyDraft(mode.kind === "new" ? mode.type : "login", initialFolder),
  );
  const [draft, setDraft] = useState<ItemDraft>(initial);
  const [errors, setErrors] = useState<DraftErrors>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState<{ conflict: ItemConflict; mine: ItemData } | null>(null);
  const leaving = useRef(false);

  const set = (patch: Partial<ItemDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const live = base ? vault.items.find((e) => e.id === base.id) : undefined;
  const changedMeanwhile = base !== null && live !== undefined && live.revision !== base.revision;
  const cancelHref = base ? itemHref(base.id) : homeHref;

  // In-app navigation with unsaved edits asks first. Not when the vault
  // locks (the key is already gone) or after a save.
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty &&
      !leaving.current &&
      keyStore.isUnlocked() &&
      currentLocation.pathname !== nextLocation.pathname,
  );
  useEffect(() => {
    if (!dirty) return;
    const onUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [dirty]);

  function leave(to: string) {
    leaving.current = true;
    navigate(to);
  }

  async function save(event?: FormEvent) {
    event?.preventDefault();
    const result = buildItemData(draft, base?.data ?? null, new Date());
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    setSaveError(null);
    setBusy(true);
    try {
      if (!base) {
        const id = await vaultActions.createItem(draft.type, draft.folderId, result.data);
        leave(itemHref(id));
      } else {
        await vaultActions.updateItem(base.encrypted, draft.folderId, result.data);
        leave(itemHref(base.id));
      }
    } catch (err) {
      if (err instanceof ItemConflict) setConflict({ conflict: err, mine: result.data });
      else setSaveError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  /** Conflict → "Save my version over it": rebuild on top of their version, then save against it. */
  async function overwrite(current: ItemConflict) {
    if (!base) return;
    const result = buildItemData(draft, current.data ?? base.data, new Date());
    if (!result.ok) {
      setConflict(null);
      setErrors(result.errors);
      return;
    }
    setBusy(true);
    try {
      await vaultActions.updateItem(current.current, draft.folderId, result.data);
      setConflict(null);
      leave(itemHref(base.id));
    } catch (err) {
      if (err instanceof ItemConflict) setConflict({ conflict: err, mine: result.data });
      else {
        setConflict(null);
        setSaveError(errorMessage(err));
      }
    } finally {
      setBusy(false);
    }
  }

  const hasLogin = draft.type === "login" || draft.type === "totp";
  const errorCount = Object.keys(errors).length;

  return (
    <form onSubmit={save} className="flex flex-col gap-4" noValidate>
      <Link to={cancelHref} className="text-sm text-accent lg:hidden">
        ← Back
      </Link>
      <header>
        <h1 className="text-xl font-semibold">
          {base ? `Edit ${base.name}` : `New ${TYPE_NAMES[draft.type].toLowerCase()}`}
        </h1>
        {base && <p className="text-sm text-muted">{TYPE_NAMES[base.type]}</p>}
      </header>

      {!base && (
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 text-sm font-medium">Type</legend>
          <div className="flex flex-wrap gap-1 rounded-md border border-line p-0.5 text-sm">
            {ITEM_TYPES.map((type) => (
              <label
                key={type}
                className={`flex-1 cursor-pointer rounded px-3 py-1.5 text-center ${
                  draft.type === type ? "bg-accent text-accent-fg" : "hover:bg-bg"
                }`}
              >
                <input
                  type="radio"
                  name="item-type"
                  value={type}
                  checked={draft.type === type}
                  onChange={() =>
                    set({
                      type,
                      uris:
                        type === "login" && draft.uris.length === 0
                          ? emptyDraft(type).uris
                          : draft.uris,
                    })
                  }
                  className="sr-only"
                />
                {TYPE_NAMES[type]}
              </label>
            ))}
          </div>
          <p className="text-xs text-muted">The type can't be changed after the item is saved.</p>
        </fieldset>
      )}

      {changedMeanwhile && (
        <Alert tone="info">
          {live?.deletedAt
            ? "This item was moved to the trash somewhere else while you were editing."
            : "This item was changed somewhere else while you were editing. Saving will ask what to keep."}
        </Alert>
      )}
      {saveError && <Alert tone="error">{saveError}</Alert>}
      {errors.form && <Alert tone="error">{errors.form}</Alert>}

      <Card>
        <Field
          label="Name"
          value={draft.name}
          maxLength={VAULT_LIMITS.nameChars}
          autoComplete="off"
          error={errors.name}
          onChange={(e) => set({ name: e.target.value })}
        />
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm">
            Folder
            <select
              value={draft.folderId ?? ""}
              onChange={(e) => set({ folderId: e.target.value || null })}
              className="rounded-md border border-line bg-bg px-2 py-1.5 text-sm"
            >
              <option value="">No folder</option>
              {vault.folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name ?? "Unreadable folder"}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.favorite}
              onChange={(e) => set({ favorite: e.target.checked })}
            />
            Favorite
          </label>
        </div>
      </Card>

      {hasLogin && (
        <Card>
          <Field
            label={draft.type === "totp" ? "Account (optional)" : "Username"}
            value={draft.username}
            maxLength={VAULT_LIMITS.usernameChars}
            autoComplete="off"
            spellCheck={false}
            error={errors.username}
            onChange={(e) => set({ username: e.target.value })}
          />
          {draft.type === "login" && (
            <PasswordInput
              value={draft.password}
              error={errors.password}
              onChange={(password) => set({ password })}
            />
          )}
          <TotpField
            value={draft.totpKey}
            settings={draft.totpSettings}
            required={draft.type === "totp"}
            error={errors.totp}
            onChange={(totpKey, totpSettings) => set({ totpKey, totpSettings })}
            onScanned={(input) => setDraft((d) => ({ ...d, ...prefillFromTotp(input, d) }))}
          />
        </Card>
      )}

      {draft.type === "login" && (
        <Card>
          <UrisEditor uris={draft.uris} errors={errors} onChange={(uris) => set({ uris })} />
        </Card>
      )}

      <Card>
        <div className="flex flex-col gap-1">
          <label htmlFor="item-note" className="text-sm font-medium">
            {draft.type === "note" ? "Note" : "Notes"}
          </label>
          <textarea
            id="item-note"
            value={draft.note}
            maxLength={VAULT_LIMITS.noteChars}
            rows={draft.type === "note" ? 10 : 4}
            onChange={(e) => set({ note: e.target.value })}
            aria-invalid={errors.note ? true : undefined}
            className={TEXTAREA}
          />
          <p className="text-xs text-muted">
            {draft.note.length.toLocaleString()} / {VAULT_LIMITS.noteChars.toLocaleString()}
          </p>
          {errors.note && <p className="text-xs text-bad">{errors.note}</p>}
        </div>
      </Card>

      <Card>
        <CustomFieldsEditor
          fields={draft.customFields}
          errors={errors}
          onChange={(customFields) => set({ customFields })}
        />
      </Card>

      {errorCount > 0 && !errors.form && (
        <Alert tone="error">Fix the highlighted fields to save.</Alert>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-40">
          <Button type="submit" busy={busy && !conflict && "Encrypting…"}>
            {base ? "Save" : "Create"}
          </Button>
        </div>
        <Link to={cancelHref} className="text-sm text-accent">
          Cancel
        </Link>
      </div>

      {conflict && base && (
        <ConflictDialog
          conflict={conflict.conflict}
          base={base.data}
          mine={conflict.mine}
          busy={busy}
          onOverwrite={() => void overwrite(conflict.conflict)}
          onDiscard={() => {
            setConflict(null);
            leave(itemHref(base.id));
          }}
          onKeepEditing={() => setConflict(null)}
        />
      )}

      {blocker.state === "blocked" && (
        <Dialog title="Discard your changes?" onClose={() => blocker.reset()}>
          <p className="text-sm">You have unsaved changes to this item.</p>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="secondary"
              className="border-bad text-bad"
              onClick={() => blocker.proceed()}
            >
              Discard
            </Button>
            <Button variant="link" onClick={() => blocker.reset()}>
              Keep editing
            </Button>
          </div>
        </Dialog>
      )}
    </form>
  );
}

/** /vault/new?type=login|note|totp (default login). Preselects the folder being viewed. */
export function NewItemRoute() {
  const [params] = useSearchParams();
  const { filter } = useVaultParams();
  const requested = params.get("type");
  const type = ITEM_TYPES.find((t) => t === requested) ?? "login";
  const folder = filter.kind === "folder" ? filter.folderId : null;
  return <ItemEditor key={type} mode={{ kind: "new", type }} initialFolder={folder} />;
}

/**
 * Checks the item once, when editing starts: if it's trashed or deleted
 * elsewhere later, the form stays (with a notice) so edits aren't lost.
 */
function EditItem({ itemId }: { itemId: string | undefined }) {
  const vault = useVault();
  const { itemHref, homeHref } = useVaultParams();
  const [entry] = useState(() => vault.items.find((e) => e.id === itemId));

  if (!entry?.data || entry.deletedAt) {
    return (
      <div className="flex flex-col gap-2 text-sm">
        <p>
          {!entry
            ? "This item doesn't exist anymore."
            : entry.deletedAt
              ? "Items in the trash can't be edited. Restore it first."
              : "This item can't be read, so it can't be edited."}
        </p>
        <Link to={entry ? itemHref(entry.id) : homeHref} className="text-accent">
          Back
        </Link>
      </div>
    );
  }
  const data = entry.data;
  return <ItemEditor mode={{ kind: "edit", entry: { ...entry, data } }} initialFolder={null} />;
}

/** /vault/:itemId/edit. Unreadable and trashed items can't be edited. */
export function EditItemRoute() {
  const { itemId } = useParams();
  return <EditItem key={itemId} itemId={itemId} />;
}
