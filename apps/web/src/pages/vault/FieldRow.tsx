// One field of an open item: label, value (masked when it's a secret) and
// Show / Copy actions. Copies clear from the clipboard after 30 s.
import { type ReactNode, useEffect, useState } from "react";
import { CLIPBOARD_CLEAR_MS, copyText } from "../../vault/clipboard";
import type { Reveal } from "../../vault/useReveal";

const MASK = "••••••••••••";

const ACTION = "rounded px-2 py-1 text-xs text-accent hover:bg-bg";

export function CopyButton({
  value,
  label = "Copy",
  onCopied,
}: {
  value: string;
  label?: string;
  onCopied?: () => void;
}) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    if (state === "idle") return;
    const id = setTimeout(() => setState("idle"), 2000);
    return () => clearTimeout(id);
  }, [state]);

  return (
    <button
      type="button"
      className={ACTION}
      title={`Clears from the clipboard after ${CLIPBOARD_CLEAR_MS / 1000} s`}
      onClick={() =>
        copyText(value).then(
          () => {
            setState("copied");
            onCopied?.();
          },
          () => setState("failed"),
        )
      }
    >
      <span aria-live="polite">
        {state === "copied" ? "Copied" : state === "failed" ? "Copy failed" : label}
      </span>
    </button>
  );
}

interface FieldRowProps {
  label: string;
  value: string;
  /** Masked until revealed; the key identifies the field in `reveal`. */
  secret?: { reveal: Reveal; field: string };
  mono?: boolean;
  multiline?: boolean;
  /** Called on copy and on reveal (marks the item recently used). */
  onUse?: () => void;
  /** Extra actions (e.g. Open for a URI). */
  actions?: ReactNode;
  children?: ReactNode;
}

export function FieldRow({
  label,
  value,
  secret,
  mono,
  multiline,
  onUse,
  actions,
  children,
}: FieldRowProps) {
  const shown = !secret || secret.reveal.isRevealed(secret.field);
  return (
    <div className="flex flex-wrap items-start justify-between gap-2 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted">{label}</p>
        <p
          className={`text-sm break-all ${mono || secret ? "font-mono" : ""} ${
            multiline ? "whitespace-pre-wrap" : ""
          }`}
        >
          {shown ? value || <span className="text-muted">—</span> : MASK}
        </p>
        {children}
      </div>
      <div className="flex shrink-0 items-center">
        {actions}
        {secret && (
          <button
            type="button"
            className={ACTION}
            aria-pressed={shown}
            onClick={() => {
              if (!shown) onUse?.();
              secret.reveal.toggle(secret.field);
            }}
          >
            {shown ? "Hide" : "Show"}
          </button>
        )}
        {value && <CopyButton value={value} onCopied={onUse} />}
      </div>
    </div>
  );
}
