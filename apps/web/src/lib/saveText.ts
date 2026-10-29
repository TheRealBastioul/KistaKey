// Download or print a piece of plain text built in the browser (recovery
// kit, recovery codes). Nothing goes to the server.
import { APP_NAME } from "../config";

/** "<app-name>-<suffix>.txt" */
export function textFileName(suffix: string): string {
  return `${APP_NAME.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${suffix}.txt`;
}

export function downloadText(fileName: string, text: string, type = "text/plain;charset=utf-8") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Prints only this text, from a throwaway iframe. The text goes in as a text node, never as HTML. */
export function printText(text: string) {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.position = "fixed";
  frame.style.width = "0";
  frame.style.height = "0";
  frame.style.border = "0";
  document.body.append(frame);
  const doc = frame.contentDocument;
  const win = frame.contentWindow;
  if (!doc || !win) {
    frame.remove();
    return;
  }
  const pre = doc.createElement("pre");
  pre.style.font = "14px/1.5 ui-monospace, monospace";
  pre.style.whiteSpace = "pre-wrap";
  pre.textContent = text;
  doc.body.append(pre);
  win.addEventListener("afterprint", () => frame.remove(), { once: true });
  win.focus();
  win.print();
}
