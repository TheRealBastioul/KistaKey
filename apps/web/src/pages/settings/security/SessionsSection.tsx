// Settings → Security → Sessions: every live login. A revoked session is
// rejected on its next request; revoking this one signs this tab out.
import type { SessionInfo } from "@repo/types";
import { useState } from "react";
import { devicesApi } from "../../../api/auth";
import { errorMessage } from "../../../api/client";
import { useAuth } from "../../../auth/AuthProvider";
import { Alert } from "../../../components/ui";
import { ConfirmButton, formatDate, Row, Section } from "../Section";

interface Props {
  sessions: SessionInfo[] | null;
  onChanged: () => Promise<void>;
}

export function SessionsSection({ sessions, onChanged }: Props) {
  const { logout } = useAuth();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function revoke(session: SessionInfo) {
    setError(null);
    setBusyId(session.id);
    try {
      await devicesApi.revokeSession(session.id);
      if (session.current) {
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
    <Section title="Sessions" description="Places you're logged in right now.">
      {error && <Alert tone="error">{error}</Alert>}
      {!sessions ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : (
        <ul className="divide-y divide-line">
          {sessions.map((s) => (
            <Row
              key={s.id}
              actions={
                <ConfirmButton
                  label={s.current ? "Sign out" : "Revoke"}
                  busy={busyId === s.id && "Revoking…"}
                  onConfirm={() => void revoke(s)}
                />
              }
            >
              <p className="font-medium">
                {s.deviceName}
                {s.current && (
                  <span className="ml-2 text-xs font-normal text-ok">This session</span>
                )}
              </p>
              <p className="text-xs text-muted">
                {s.ipAddress ?? "Unknown IP"} · started {formatDate(s.createdAt)} · active{" "}
                {formatDate(s.lastSeenAt)}
              </p>
            </Row>
          ))}
        </ul>
      )}
    </Section>
  );
}
