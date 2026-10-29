// Settings → Security → Devices: browsers (later: extension, phones) that
// have logged in. Revoking one signs out its sessions and drops its trust;
// revoking this one signs this tab out.
import type { Device } from "@repo/types";
import { useState } from "react";
import { devicesApi } from "../../../api/auth";
import { errorMessage } from "../../../api/client";
import { useAuth } from "../../../auth/AuthProvider";
import { Alert } from "../../../components/ui";
import { ConfirmButton, formatDate, Row, Section } from "../Section";

interface Props {
  devices: Device[] | null;
  onChanged: () => Promise<void>;
}

export function DevicesSection({ devices, onChanged }: Props) {
  const { logout } = useAuth();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function revoke(device: Device) {
    setError(null);
    setBusyId(device.id);
    try {
      await devicesApi.revokeDevice(device.id);
      if (device.current) {
        await logout();
        return;
      }
      await onChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Section
      title="Devices"
      description="Where your account is used. Remove one you don't recognize: it's signed out and must pass two-step login again."
    >
      {error && <Alert tone="error">{error}</Alert>}
      {!devices ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : (
        <ul className="divide-y divide-line">
          {devices.map((d) => (
            <Row
              key={d.id}
              actions={
                <ConfirmButton
                  label={d.current ? "Remove and sign out" : "Remove"}
                  busy={busyId === d.id && "Removing…"}
                  onConfirm={() => void revoke(d)}
                />
              }
            >
              <p className="font-medium">
                {d.name}
                {d.current && <span className="ml-2 text-xs font-normal text-ok">This device</span>}
              </p>
              <p className="text-xs text-muted">
                Last seen {formatDate(d.lastSeenAt)} · first seen {formatDate(d.firstSeenAt)}
                {d.trustedUntil && new Date(d.trustedUntil) > new Date()
                  ? ` · skips two-step login until ${formatDate(d.trustedUntil)}`
                  : ""}
              </p>
            </Row>
          ))}
        </ul>
      )}
    </Section>
  );
}
