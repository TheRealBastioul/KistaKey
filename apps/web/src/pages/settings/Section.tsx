import { type ReactNode, useState } from "react";
import { Button } from "../../components/ui";

/** One settings card: heading, short explanation, content. */
export function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-5">
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {children}
    </section>
  );
}

/** A row in a settings list: main text on the left, actions on the right. */
export function Row({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0 text-sm">{children}</div>
      {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
    </li>
  );
}

/** A destructive action that asks once inline ("Sure?  Yes · Cancel") before running. */
export function ConfirmButton({
  label,
  confirmLabel = "Yes",
  question = "Sure?",
  busy,
  disabled,
  onConfirm,
}: {
  label: string;
  confirmLabel?: string;
  question?: string;
  busy?: string | false;
  disabled?: boolean;
  onConfirm: () => void;
}) {
  const [asking, setAsking] = useState(false);
  if (busy) return <Button variant="secondary" busy={busy} />;
  if (!asking) {
    return (
      <Button variant="secondary" disabled={disabled} onClick={() => setAsking(true)}>
        {label}
      </Button>
    );
  }
  return (
    <span className="flex items-center gap-2 text-sm">
      {question}
      <Button
        variant="secondary"
        className="border-bad text-bad"
        onClick={() => {
          setAsking(false);
          onConfirm();
        }}
      >
        {confirmLabel}
      </Button>
      <Button variant="link" onClick={() => setAsking(false)}>
        Cancel
      </Button>
    </span>
  );
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}
