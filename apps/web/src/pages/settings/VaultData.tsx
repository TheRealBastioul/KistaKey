// /settings/vault: import from other password managers and export the
// vault. Both work on the decrypted vault in this tab, so it syncs on open.
import { useEffect } from "react";
import { Alert } from "../../components/ui";
import { useVault, vaultStore } from "../../vault/useVault";
import { ExportSection } from "./vault/ExportSection";
import { ImportSection } from "./vault/ImportSection";

export function VaultData() {
  const vault = useVault();

  useEffect(() => {
    void vaultStore.sync();
  }, []);

  if (vault.status === "idle" || vault.status === "loading") {
    return <p className="text-sm text-muted">Decrypting your vault…</p>;
  }
  if (vault.status === "error") {
    return <Alert tone="error">Couldn't load your vault: {vault.error}</Alert>;
  }
  return (
    <div className="flex flex-col gap-6">
      <ImportSection />
      <ExportSection />
    </div>
  );
}
