// Copy to the clipboard, cleared again after CLIPBOARD_CLEAR_MS (decisions
// §17). Browsers only allow a clipboard write while the page has focus, so
// a clear that comes due in the background waits for the next focus. We
// can't read the clipboard back without a permission prompt, so the clear
// is unconditional: whatever is on it 30 s after our copy is replaced.
export const CLIPBOARD_CLEAR_MS = 30_000;

let timer: ReturnType<typeof setTimeout> | undefined;
let waitingForFocus: (() => void) | undefined;

function cancelClear() {
  clearTimeout(timer);
  timer = undefined;
  if (waitingForFocus) window.removeEventListener("focus", waitingForFocus);
  waitingForFocus = undefined;
}

async function clearNow(): Promise<void> {
  try {
    await navigator.clipboard.writeText("");
  } catch {
    // Not allowed right now (no focus): try once more when the tab is back.
    if (waitingForFocus) return;
    waitingForFocus = () => {
      waitingForFocus = undefined;
      void navigator.clipboard.writeText("").catch(() => {});
    };
    window.addEventListener("focus", waitingForFocus, { once: true });
  }
}

/** Throws if the browser refuses the write (no clipboard API, no focus). */
export async function copyText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
  cancelClear();
  timer = setTimeout(() => {
    timer = undefined;
    void clearNow();
  }, CLIPBOARD_CLEAR_MS);
}
