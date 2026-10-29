// Top-bar account menu: who's signed in, Lock now, Security settings, Sign out.
// Lock wipes the key (the guard then shows /lock); sign out ends the session.
import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router";
import { useAuth } from "../auth/AuthProvider";

const ITEM = "block w-full rounded px-3 py-2 text-left text-sm hover:bg-bg";

export function UserMenu() {
  const { state, lock, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const email = state.status === "session" ? state.session.user.email : "";

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((o) => !o)}
        className="max-w-48 truncate rounded-md border border-line px-3 py-1.5 text-sm hover:bg-bg"
      >
        {email || "Account"}
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          className="absolute right-0 z-10 mt-1 w-52 rounded-md border border-line bg-surface p-1 shadow-md"
        >
          <button type="button" role="menuitem" className={ITEM} onClick={() => lock()}>
            Lock now
          </button>
          <Link
            to="/settings/security"
            role="menuitem"
            className={ITEM}
            onClick={() => setOpen(false)}
          >
            Security settings
          </Link>
          <button
            type="button"
            role="menuitem"
            className={`${ITEM} text-bad`}
            onClick={() => void logout()}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
