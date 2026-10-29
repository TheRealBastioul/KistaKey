// The authenticator key part of the editor: type or paste the setup key (or
// a whole otpauth:// URI), upload a screenshot of the QR code, or scan it
// with the camera. Once the key is valid the live code shows, so it can be
// compared with a phone authenticator before saving.
import type { TotpConfig } from "@repo/types";
import { useRef, useState } from "react";
import { Button, Field } from "../../../components/ui";
import { cameraSupported, decodeQrImage } from "../../../vault/qr";
import { parseTotpInput, type TotpInput, type TotpSettings } from "../../../vault/totpInput";
import { useTotp } from "../../../vault/useTotp";
import { QrScanner } from "./QrScanner";

const SELECT = "rounded-md border border-line bg-bg px-2 py-1.5 text-sm";

function LiveCode({ config }: { config: TotpConfig }) {
  const totp = useTotp(config);
  if (!totp?.code) return null;
  return (
    <p className="text-sm text-muted">
      Current code:{" "}
      <span className="font-mono text-base tracking-wider text-fg">
        {totp.code.replace(/(\d{3})(?=\d)/g, "$1 ")}
      </span>{" "}
      ({totp.remaining}s). It should match the site or your authenticator app.
    </p>
  );
}

export function TotpField({
  value,
  settings,
  required,
  error,
  onChange,
  onScanned,
}: {
  value: string;
  settings: TotpSettings;
  required: boolean;
  error?: string;
  onChange: (value: string, settings: TotpSettings) => void;
  /** A QR code or pasted URI was read: the key and settings are already applied. */
  onScanned: (input: TotpInput) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [scanning, setScanning] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  let config: TotpConfig | null = null;
  try {
    config = value.trim() ? parseTotpInput(value, settings).totp : null;
  } catch {
    config = null;
  }

  function apply(input: TotpInput) {
    const { secret, ...rest } = input.totp;
    onChange(secret, rest);
    onScanned(input);
    setNotice(
      input.issuer || input.account
        ? `Read the setup code for ${[input.issuer, input.account].filter(Boolean).join(" · ")}.`
        : "Read the setup code.",
    );
  }

  async function upload(file: File) {
    setBusy(true);
    setNotice(null);
    let text: string | null;
    try {
      text = await decodeQrImage(file);
    } catch {
      setNotice("That file couldn't be read as an image.");
      return;
    } finally {
      setBusy(false);
    }
    if (!text) {
      setNotice("No QR code found in that image. Try a sharper or tighter screenshot.");
      return;
    }
    try {
      apply(parseTotpInput(text));
    } catch (err) {
      setNotice(
        /^otpauth:/i.test(text) && err instanceof Error
          ? err.message
          : "That QR code isn't an authenticator setup code.",
      );
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Field
        label={required ? "Setup key" : "Authenticator key (optional)"}
        value={value}
        autoComplete="off"
        spellCheck={false}
        placeholder="Setup key, or paste an otpauth:// link"
        error={error}
        onChange={(e) => {
          const text = e.target.value;
          // A pasted otpauth:// link is unpacked at once (key, settings, name).
          if (/^\s*otpauth:/i.test(text)) {
            try {
              apply(parseTotpInput(text));
              return;
            } catch {
              // Leave it as typed; saving shows why it's invalid.
            }
          }
          setNotice(null);
          onChange(text, settings);
        }}
      />
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          busy={busy && "Reading…"}
          onClick={() => fileInput.current?.click()}
        >
          Upload QR image
        </Button>
        {cameraSupported() && (
          <Button variant="secondary" onClick={() => setScanning(true)}>
            Scan with camera
          </Button>
        )}
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void upload(file);
          }}
        />
      </div>
      {notice && (
        <p className="text-sm text-muted" aria-live="polite">
          {notice}
        </p>
      )}
      {config && <LiveCode config={config} />}

      <details className="text-sm">
        <summary className="cursor-pointer text-muted">Advanced settings</summary>
        <div className="mt-2 flex flex-wrap gap-3">
          <label className="flex items-center gap-2">
            Algorithm
            <select
              className={SELECT}
              value={settings.algorithm}
              onChange={(e) =>
                onChange(value, {
                  ...settings,
                  algorithm: e.target.value as TotpSettings["algorithm"],
                })
              }
            >
              <option value="SHA1">SHA-1</option>
              <option value="SHA256">SHA-256</option>
              <option value="SHA512">SHA-512</option>
            </select>
          </label>
          <label className="flex items-center gap-2">
            Digits
            <select
              className={SELECT}
              value={settings.digits}
              onChange={(e) => onChange(value, { ...settings, digits: Number(e.target.value) })}
            >
              {[6, 7, 8].map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            Period (s)
            <input
              type="number"
              min={1}
              max={300}
              className={`${SELECT} w-20`}
              value={settings.period}
              onChange={(e) => onChange(value, { ...settings, period: Number(e.target.value) })}
            />
          </label>
        </div>
        <p className="mt-1 text-xs text-muted">
          Leave these alone unless the site says otherwise. A scanned code sets them for you.
        </p>
      </details>

      {scanning && (
        <QrScanner
          onScanned={(input) => {
            setScanning(false);
            apply(input);
          }}
          onClose={() => setScanning(false)}
        />
      )}
    </div>
  );
}
