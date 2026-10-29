// Camera QR scanner in a modal. Frames are decoded in this tab only
// (vault/qr.ts). The stream stops as soon as a setup code is read, on
// Close / Escape, on unmount and when the tab is hidden.
import { useEffect, useRef, useState } from "react";
import { Dialog } from "../../../components/Dialog";
import { Button } from "../../../components/ui";
import { cameraErrorMessage, startQrScan } from "../../../vault/qr";
import { parseTotpInput, type TotpInput } from "../../../vault/totpInput";

export function QrScanner({
  onScanned,
  onClose,
}: {
  onScanned: (input: TotpInput) => void;
  onClose: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  // Latest callbacks without restarting the camera when the parent re-renders.
  const callbacks = useRef({ onScanned, onClose });
  callbacks.current = { onScanned, onClose };

  useEffect(() => {
    const el = video.current;
    if (!el) return;
    const stop = startQrScan(el, {
      onCode(text) {
        try {
          const input = parseTotpInput(text);
          callbacks.current.onScanned(input);
          return true;
        } catch (err) {
          setHint(
            /^otpauth:/i.test(text) && err instanceof Error
              ? err.message
              : "That QR code isn't an authenticator setup code. Keep looking.",
          );
          return false;
        }
      },
      onError: (err) => setError(cameraErrorMessage(err)),
    });
    const onHidden = () => {
      if (document.hidden) callbacks.current.onClose();
    };
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      document.removeEventListener("visibilitychange", onHidden);
      stop();
    };
  }, []);

  return (
    <Dialog title="Scan the QR code" onClose={onClose}>
      <p className="text-sm text-muted">
        Hold the site's 2FA setup QR code up to the camera. The image stays on this device.
      </p>
      {error ? (
        <p role="alert" className="text-sm text-bad">
          {error}
        </p>
      ) : (
        <video
          ref={video}
          muted
          playsInline
          className="aspect-video w-full rounded-md border border-line bg-black object-cover"
        />
      )}
      {hint && !error && (
        <p className="text-sm text-muted" aria-live="polite">
          {hint}
        </p>
      )}
      <Button variant="secondary" className="self-end" onClick={onClose}>
        Close
      </Button>
    </Dialog>
  );
}
