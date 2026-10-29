// Settings → Security → Two-step login: add / remove the authenticator app
// and security keys. The API refuses to remove the last method (decisions
// §11.20); the UI disables it too, with the reason.
import type { MfaOverviewResponse, TotpSetupResponse } from "@repo/types";
import { toDataURL } from "qrcode";
import { type FormEvent, useState } from "react";
import { mfaApi } from "../../../api/auth";
import { errorMessage } from "../../../api/client";
import { groupSecret, isTotpCode, normalizeTotpCode } from "../../../auth/codes";
import {
  browserSupportsWebAuthn,
  registerSecurityKey,
  securityKeyErrorMessage,
} from "../../../auth/webauthn";
import { Alert, Button, Field } from "../../../components/ui";
import { ConfirmButton, formatDate, Row, Section } from "../Section";

type Adding =
  | { kind: "none" }
  | { kind: "totp"; setup: TotpSetupResponse; qr: string }
  | { kind: "key" };

interface Props {
  overview: MfaOverviewResponse | null;
  onChanged: () => Promise<void>;
}

export function TwoStepSection({ overview, onChanged }: Props) {
  const [adding, setAdding] = useState<Adding>({ kind: "none" });
  const [code, setCode] = useState("");
  const [keyName, setKeyName] = useState("Security key");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const methodCount = overview ? (overview.totp.enabled ? 1 : 0) + overview.webauthn.length : 0;
  const isLast = methodCount <= 1;
  const lastHint = "Add another method before removing your only one.";

  /** Runs an action with a busy marker; refreshes the overview on success. */
  async function run(marker: string, action: () => Promise<string | null>) {
    setError(null);
    setNotice(null);
    setBusy(marker);
    try {
      const message = await action();
      await onChanged();
      setNotice(message);
    } catch (err) {
      setError(marker === "key-add" ? securityKeyErrorMessage(err) : errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function startTotp() {
    setError(null);
    setNotice(null);
    setBusy("totp-start");
    try {
      const setup = await mfaApi.totpSetup();
      const qr = await toDataURL(setup.otpauthUri, { margin: 1, width: 192 });
      setCode("");
      setAdding({ kind: "totp", setup, qr });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  function confirmTotp(event: FormEvent) {
    event.preventDefault();
    if (!isTotpCode(code)) {
      setError("Enter the 6-digit code from your authenticator app.");
      return;
    }
    void run("totp-confirm", async () => {
      await mfaApi.totpConfirm(normalizeTotpCode(code));
      setAdding({ kind: "none" });
      setCode("");
      return "Authenticator app turned on.";
    });
  }

  function addKey(event: FormEvent) {
    event.preventDefault();
    const name = keyName.trim();
    if (!name) {
      setError("Give the security key a name.");
      return;
    }
    void run("key-add", async () => {
      await registerSecurityKey(name.slice(0, 64));
      setAdding({ kind: "none" });
      return `Security key "${name}" added.`;
    });
  }

  if (!overview) {
    return (
      <Section title="Two-step login">
        <p className="text-sm text-muted">Loading…</p>
      </Section>
    );
  }

  const webauthn = browserSupportsWebAuthn();

  return (
    <Section
      title="Two-step login"
      description="A second step besides your master password. Keep at least one method; two is safer."
    >
      {error && <Alert tone="error">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}

      <ul className="divide-y divide-line">
        <Row
          actions={
            overview.totp.enabled ? (
              <ConfirmButton
                label="Remove"
                disabled={isLast}
                busy={busy === "totp-remove" && "Removing…"}
                onConfirm={() =>
                  void run("totp-remove", async () => {
                    await mfaApi.totpRemove();
                    return "Authenticator app removed.";
                  })
                }
              />
            ) : (
              adding.kind !== "totp" && (
                <Button
                  variant="secondary"
                  busy={busy === "totp-start" && "Preparing…"}
                  onClick={startTotp}
                >
                  Set up
                </Button>
              )
            )
          }
        >
          <p className="font-medium">Authenticator app</p>
          <p className="text-xs text-muted">
            {overview.totp.enabled && overview.totp.confirmedAt
              ? `On since ${formatDate(overview.totp.confirmedAt)}`
              : "Off"}
            {overview.totp.enabled && isLast && ` · ${lastHint}`}
          </p>
        </Row>

        {overview.webauthn.map((key) => (
          <Row
            key={key.id}
            actions={
              <ConfirmButton
                label="Remove"
                disabled={isLast}
                busy={busy === `key-remove-${key.id}` && "Removing…"}
                onConfirm={() =>
                  void run(`key-remove-${key.id}`, async () => {
                    await mfaApi.webauthnRemove(key.id);
                    return `Security key "${key.name}" removed.`;
                  })
                }
              />
            }
          >
            <p className="font-medium">{key.name}</p>
            <p className="text-xs text-muted">
              Security key · added {formatDate(key.createdAt)}
              {key.lastUsedAt ? ` · last used ${formatDate(key.lastUsedAt)}` : " · never used"}
              {isLast && ` · ${lastHint}`}
            </p>
          </Row>
        ))}
      </ul>

      {adding.kind === "totp" && (
        <form
          onSubmit={confirmTotp}
          className="flex flex-col gap-3 rounded-md border border-line p-4"
          noValidate
        >
          <p className="text-sm">
            Scan the QR code with your authenticator app (or type the key), then enter the code it
            shows.
          </p>
          <img
            src={adding.qr}
            alt="QR code for your authenticator app"
            width={192}
            height={192}
            className="mx-auto rounded-md bg-white p-1"
          />
          <output className="rounded-md border border-line bg-bg p-2 text-center font-mono text-sm break-all select-all">
            {groupSecret(adding.setup.secret)}
          </output>
          <Field
            label="6-digit code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={7}
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <div className="flex flex-col gap-2">
            <Button type="submit" busy={busy === "totp-confirm" && "Checking…"}>
              Turn on
            </Button>
            <Button variant="link" onClick={() => setAdding({ kind: "none" })}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {adding.kind === "key" && (
        <form
          onSubmit={addKey}
          className="flex flex-col gap-3 rounded-md border border-line p-4"
          noValidate
        >
          <Field
            label="Name"
            maxLength={64}
            value={keyName}
            onChange={(e) => setKeyName(e.target.value)}
            hint="Your browser will ask you to touch or unlock the key."
          />
          <div className="flex flex-col gap-2">
            <Button type="submit" busy={busy === "key-add" && "Waiting for your security key…"}>
              Add security key
            </Button>
            <Button variant="link" onClick={() => setAdding({ kind: "none" })}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {adding.kind === "none" && (
        <div>
          <Button
            variant="secondary"
            disabled={!webauthn}
            onClick={() => {
              setError(null);
              setNotice(null);
              setAdding({ kind: "key" });
            }}
          >
            Add security key or Windows Hello
          </Button>
          {!webauthn && (
            <p className="mt-1 text-xs text-muted">This browser doesn't support security keys.</p>
          )}
        </div>
      )}
    </Section>
  );
}
