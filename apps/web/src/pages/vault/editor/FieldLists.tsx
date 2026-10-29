// Repeating parts of the editor: the website list of a login and the custom
// fields of any item (text or hidden). Blank rows are dropped on save.
import { VAULT_LIMITS } from "@repo/types";
import { useState } from "react";
import { Button } from "../../../components/ui";
import {
  type CustomFieldDraft,
  type DraftErrors,
  newCustomField,
  newUri,
  type UriDraft,
} from "../../../vault/editorModel";

const INPUT =
  "min-w-0 rounded-md border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-accent";
const REMOVE = "rounded px-2 py-1 text-xs text-muted hover:bg-bg hover:text-bad";

function Heading({ children }: { children: string }) {
  return <h3 className="text-sm font-medium">{children}</h3>;
}

export function UrisEditor({
  uris,
  errors,
  onChange,
}: {
  uris: UriDraft[];
  errors: DraftErrors;
  onChange: (uris: UriDraft[]) => void;
}) {
  const update = (key: string, uri: string) =>
    onChange(uris.map((u) => (u.key === key ? { ...u, uri } : u)));
  return (
    <section className="flex flex-col gap-2">
      <Heading>Websites</Heading>
      {uris.map((u, i) => (
        <div key={u.key} className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <input
              aria-label={`Website ${i + 1}`}
              value={u.uri}
              maxLength={VAULT_LIMITS.uriChars}
              placeholder="example.com"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => update(u.key, e.target.value)}
              className={`${INPUT} flex-1`}
            />
            <button
              type="button"
              className={REMOVE}
              aria-label={`Remove website ${i + 1}`}
              onClick={() => onChange(uris.filter((x) => x.key !== u.key))}
            >
              Remove
            </button>
          </div>
          {errors[`uri:${u.key}`] && <p className="text-xs text-bad">{errors[`uri:${u.key}`]}</p>}
        </div>
      ))}
      {uris.length < VAULT_LIMITS.uris && (
        <Button variant="link" className="self-start" onClick={() => onChange([...uris, newUri()])}>
          + Add website
        </Button>
      )}
    </section>
  );
}

function CustomFieldRow({
  field,
  error,
  onChange,
  onRemove,
}: {
  field: CustomFieldDraft;
  error?: string;
  onChange: (field: CustomFieldDraft) => void;
  onRemove: () => void;
}) {
  const [shown, setShown] = useState(!field.hidden);
  return (
    <div className="flex flex-col gap-1 rounded-md border border-line p-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          aria-label="Field label"
          placeholder="Label"
          value={field.label}
          maxLength={VAULT_LIMITS.customFieldLabelChars}
          onChange={(e) => onChange({ ...field, label: e.target.value })}
          className={`${INPUT} w-36`}
        />
        <input
          aria-label={`Value of ${field.label || "field"}`}
          placeholder="Value"
          type={field.hidden && !shown ? "password" : "text"}
          autoComplete="off"
          value={field.value}
          maxLength={VAULT_LIMITS.customFieldValueChars}
          onChange={(e) => onChange({ ...field, value: e.target.value })}
          className={`${INPUT} flex-1 ${field.hidden ? "font-mono" : ""}`}
        />
      </div>
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={field.hidden}
            onChange={(e) => {
              onChange({ ...field, hidden: e.target.checked });
              setShown(!e.target.checked);
            }}
          />
          Hidden (masked like a password)
        </label>
        {field.hidden && (
          <button
            type="button"
            className="text-accent"
            aria-pressed={shown}
            onClick={() => setShown(!shown)}
          >
            {shown ? "Hide" : "Show"}
          </button>
        )}
        <button type="button" className={`${REMOVE} ml-auto`} onClick={onRemove}>
          Remove
        </button>
      </div>
      {error && <p className="text-xs text-bad">{error}</p>}
    </div>
  );
}

export function CustomFieldsEditor({
  fields,
  errors,
  onChange,
}: {
  fields: CustomFieldDraft[];
  errors: DraftErrors;
  onChange: (fields: CustomFieldDraft[]) => void;
}) {
  return (
    <section className="flex flex-col gap-2">
      <Heading>Custom fields</Heading>
      {fields.length === 0 && (
        <p className="text-xs text-muted">
          Extra details like a PIN or a security answer. Hidden values are masked like passwords and
          never searched.
        </p>
      )}
      {fields.map((field) => (
        <CustomFieldRow
          key={field.id}
          field={field}
          error={errors[`custom:${field.id}`]}
          onChange={(next) => onChange(fields.map((f) => (f.id === field.id ? next : f)))}
          onRemove={() => onChange(fields.filter((f) => f.id !== field.id))}
        />
      ))}
      {fields.length < VAULT_LIMITS.customFields && (
        <div className="flex flex-wrap gap-3">
          <Button variant="link" onClick={() => onChange([...fields, newCustomField(false)])}>
            + Add text field
          </Button>
          <Button variant="link" onClick={() => onChange([...fields, newCustomField(true)])}>
            + Add hidden field
          </Button>
        </div>
      )}
    </section>
  );
}
