// Modal dialog on the native <dialog> element: focus is trapped, the page
// behind is inert and Escape closes it (reported through onClose).
import { type ReactNode, useEffect, useRef } from "react";

export function Dialog({
  title,
  onClose,
  children,
}: {
  title: string;
  /** Escape, the backdrop or a Close button. */
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    dialog.showModal();
    return () => dialog.close();
  }, []);

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: the click is only the backdrop; Escape is onCancel
    <dialog
      ref={ref}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-lg border border-line bg-surface p-0 text-fg backdrop:bg-black/50"
    >
      <div className="flex flex-col gap-4 p-5">
        <h2 className="text-base font-semibold">{title}</h2>
        {children}
      </div>
    </dialog>
  );
}
