// /vault: three panes. Sidebar (filters + folders) · catalog (search +
// list) · detail (<Outlet/>: Dashboard or ItemDetail). The filter and query
// live in the URL (`?view=`, `?q=`) so they survive opening an item. Live
// updates run while the page is open (they sync on connect); it also syncs
// on open and whenever the tab becomes visible again.
import { useEffect } from "react";
import { Outlet, useMatch } from "react-router";
import { Alert, Button } from "../../components/ui";
import { liveSync, useVault, vaultStore } from "../../vault/useVault";
import { Catalog } from "./Catalog";
import { LiveIndicator } from "./LiveIndicator";
import { Sidebar } from "./Sidebar";

export function VaultPage() {
  const vault = useVault();
  // An item, its editor or /vault/new.
  const itemOpen = useMatch("/vault/:itemId/*") !== null;

  useEffect(() => {
    void vaultStore.sync();
    liveSync.start();
    const onVisible = () => {
      if (!document.hidden) void vaultStore.sync();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      liveSync.stop();
    };
  }, []);

  if (vault.status === "idle" || vault.status === "loading") {
    return <p className="text-sm text-muted">Decrypting your vault…</p>;
  }
  if (vault.status === "error") {
    return (
      <div className="flex max-w-md flex-col gap-3">
        <Alert tone="error">Couldn't load your vault: {vault.error}</Alert>
        <Button variant="secondary" className="self-start" onClick={() => void vaultStore.sync()}>
          Try again
        </Button>
      </div>
    );
  }

  // Small screens show one pane at a time: the list, or the open item.
  return (
    <div className="flex flex-col gap-4 lg:grid lg:h-[calc(100dvh-10rem)] lg:grid-cols-[13rem_20rem_1fr]">
      <div className={`${itemOpen ? "hidden lg:flex" : "flex"} flex-col gap-4 lg:overflow-y-auto`}>
        <Sidebar />
        <LiveIndicator />
      </div>
      <div className={`${itemOpen ? "hidden lg:flex" : "flex"} min-h-0 flex-col`}>
        <Catalog />
      </div>
      <div className={`${itemOpen ? "" : "hidden lg:block"} min-w-0 lg:overflow-y-auto`}>
        {vault.error && (
          <div className="mb-3">
            <Alert tone="error">Couldn't refresh: {vault.error}</Alert>
          </div>
        )}
        <Outlet />
      </div>
    </div>
  );
}
