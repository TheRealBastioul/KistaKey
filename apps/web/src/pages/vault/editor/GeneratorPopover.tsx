// "Generate" next to the password field: a panel with password / passphrase
// options, a live preview and "Use this". State and controls are shared with
// the /generator page (components/GeneratorControls.tsx).
import { useCallback, useRef, useState } from "react";
import { GeneratorControls, useGenerator } from "../../../components/GeneratorControls";
import { Button } from "../../../components/ui";
import { useDismiss } from "../../../lib/useDismiss";

function GeneratorPanel({
  onUse,
  onClose,
}: {
  onUse: (value: string) => void;
  onClose: () => void;
}) {
  const gen = useGenerator();
  return (
    <div className="flex flex-col gap-3">
      <GeneratorControls gen={gen} />
      <Button onClick={() => onUse(gen.value)}>Use this</Button>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" onClick={() => gen.regenerate()}>
          Regenerate
        </Button>
        <Button variant="link" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

/** The trigger button plus the panel under it. Escape or a click outside closes it. */
export function GeneratorPopover({ onUse }: { onUse: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);

  return (
    <div ref={ref} className="relative">
      <Button
        variant="secondary"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen(!open)}
      >
        Generate
      </Button>
      {open && (
        <div
          role="dialog"
          aria-label="Password generator"
          className="absolute right-0 z-20 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-lg border border-line bg-surface p-4 shadow-lg"
        >
          <GeneratorPanel
            onUse={(value) => {
              onUse(value);
              setOpen(false);
            }}
            onClose={() => setOpen(false)}
          />
        </div>
      )}
    </div>
  );
}
