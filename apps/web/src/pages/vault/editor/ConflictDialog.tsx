// Shown when a save gets a 409: the item changed (or was trashed) in another
// tab or device since editing started. The user picks: save theirs over
// with mine, take their version (drop my edits), or keep editing.
import type { ItemData } from "@repo/types";
import { Dialog } from "../../../components/Dialog";
import { Button } from "../../../components/ui";
import { changedFields } from "../../../vault/editorModel";
import type { ItemConflict } from "../../../vault/useVault";
import { formatDate } from "../../settings/Section";

function List({ title, fields }: { title: string; fields: string[] }) {
  return (
    <div>
      <p className="text-xs font-semibold text-muted uppercase">{title}</p>
      <p className="text-sm">{fields.length ? fields.join(", ") : "Nothing that this app shows"}</p>
    </div>
  );
}

export function ConflictDialog({
  conflict,
  base,
  mine,
  busy,
  onOverwrite,
  onDiscard,
  onKeepEditing,
}: {
  conflict: ItemConflict;
  /** The version editing started from (null for an unreadable base). */
  base: ItemData | null;
  /** The draft as it would be saved. */
  mine: ItemData | null;
  busy: boolean;
  onOverwrite: () => void;
  onDiscard: () => void;
  onKeepEditing: () => void;
}) {
  const trashed = conflict.current.deletedAt !== null;
  const theirs = conflict.data;
  const when = formatDate(conflict.current.updatedAt);

  return (
    <Dialog title="This item changed somewhere else" onClose={onKeepEditing}>
      {trashed ? (
        <p className="text-sm">
          It was moved to the trash (in another tab or on another device) on {when}. Restore it from
          the trash first if you want to keep editing it.
        </p>
      ) : (
        <>
          <p className="text-sm">
            Someone saved a newer version on {when}, in another tab or on another device, after you
            started editing. Nothing has been overwritten yet.
          </p>
          {theirs && base && mine ? (
            <div className="flex flex-col gap-2 rounded-md border border-line p-3">
              <List title="Changed there" fields={changedFields(base, theirs)} />
              <List title="Your changes" fields={changedFields(base, mine)} />
            </div>
          ) : (
            !theirs && (
              <p className="text-sm text-bad">The newer version can't be read on this device.</p>
            )
          )}
        </>
      )}
      <div className="flex flex-col gap-2">
        {!trashed && (
          <Button busy={busy && "Saving…"} onClick={onOverwrite}>
            Save my version over it
          </Button>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" disabled={busy} onClick={onDiscard}>
            {trashed ? "Discard my changes" : "Use their version"}
          </Button>
          <Button variant="link" disabled={busy} onClick={onKeepEditing}>
            Keep editing
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
