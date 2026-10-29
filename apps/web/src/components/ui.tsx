// Small UI kit for forms: Button, Field, Alert. Semantic color tokens only
// (see index.css).
import { type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, useId } from "react";

type ButtonVariant = "primary" | "secondary" | "link";

const BUTTON_STYLES: Record<ButtonVariant, string> = {
  primary:
    "w-full rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg hover:opacity-90",
  secondary: "rounded-md border border-line bg-surface px-3 py-2 text-sm font-medium hover:bg-bg",
  link: "text-sm text-accent underline-offset-2 hover:underline",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  /** Disables the button and shows this label while an action runs. */
  busy?: string | false;
}

export function Button({
  variant = "primary",
  busy = false,
  type = "button",
  className = "",
  disabled,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || busy !== false}
      aria-busy={busy !== false || undefined}
      className={`${BUTTON_STYLES[variant]} disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...rest}
    >
      {busy || children}
    </button>
  );
}

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  /** Rendered under the input (e.g. a strength meter). */
  children?: ReactNode;
}

export function Field({ label, hint, error, children, className = "", ...input }: FieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ");
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        className="rounded-md border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
        {...input}
      />
      {children}
      {hint && (
        <p id={hintId} className="text-xs text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-xs text-bad">
          {error}
        </p>
      )}
    </div>
  );
}

type AlertTone = "error" | "info" | "success";

const ALERT_STYLES: Record<AlertTone, string> = {
  error: "border-bad text-bad",
  info: "border-line text-fg",
  success: "border-ok text-ok",
};

export function Alert({ tone = "info", children }: { tone?: AlertTone; children: ReactNode }) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`rounded-md border bg-surface px-3 py-2 text-sm ${ALERT_STYLES[tone]}`}
    >
      {children}
    </div>
  );
}
