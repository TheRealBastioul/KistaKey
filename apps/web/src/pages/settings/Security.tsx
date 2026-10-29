// /settings/security: two-step login, recovery codes, devices, sessions,
// master password, recovery kit. The API enforces every rule; this page
// loads the lists once and reloads them after a change.
import { useCallback } from "react";
import { devicesApi, mfaApi } from "../../api/auth";
import { useAuth } from "../../auth/AuthProvider";
import { Alert } from "../../components/ui";
import { useLoad } from "../../lib/useLoad";
import { DevicesSection } from "./security/DevicesSection";
import { MasterPasswordSection } from "./security/MasterPasswordSection";
import { RecoveryCodesSection } from "./security/RecoveryCodesSection";
import { RecoveryKitSection } from "./security/RecoveryKitSection";
import { SessionsSection } from "./security/SessionsSection";
import { TwoStepSection } from "./security/TwoStepSection";

const loadDevices = async () => (await devicesApi.devices()).devices;
const loadSessions = async () => (await devicesApi.sessions()).sessions;

export function Security() {
  const { state } = useAuth();
  const email = state.status === "session" ? state.session.user.email : "";
  const mfa = useLoad(mfaApi.overview);
  const devices = useLoad(loadDevices);
  const sessions = useLoad(loadSessions);

  const reloadMfa = mfa.reload;
  const reloadDevices = devices.reload;
  const reloadSessions = sessions.reload;
  // Removing a device also ends its sessions (and the other way round changes "last seen").
  const reloadDevicesAndSessions = useCallback(async () => {
    await Promise.all([reloadDevices(), reloadSessions()]);
  }, [reloadDevices, reloadSessions]);

  const loadError = mfa.error ?? devices.error ?? sessions.error;

  return (
    <div className="flex flex-col gap-4">
      {loadError && <Alert tone="error">{loadError}</Alert>}
      <TwoStepSection overview={mfa.data} onChanged={reloadMfa} />
      <RecoveryCodesSection email={email} overview={mfa.data} onChanged={reloadMfa} />
      <DevicesSection devices={devices.data} onChanged={reloadDevicesAndSessions} />
      <SessionsSection sessions={sessions.data} onChanged={reloadDevicesAndSessions} />
      <MasterPasswordSection onChanged={reloadDevicesAndSessions} />
      <RecoveryKitSection />
    </div>
  );
}
