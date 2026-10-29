import type { ReactNode } from "react";
import { createBrowserRouter, Navigate } from "react-router";
import { PublicOnly, RequireApp, RequireStep } from "./auth/guards";
import { AppShell } from "./layout/AppShell";
import { AuthLayout } from "./layout/AuthLayout";
import { AcceptTerms } from "./pages/auth/AcceptTerms";
import { CheckEmail } from "./pages/auth/CheckEmail";
import { Lock } from "./pages/auth/Lock";
import { Login } from "./pages/auth/Login";
import { MfaChallenge } from "./pages/auth/MfaChallenge";
import { Recover } from "./pages/auth/Recover";
import { SetupMfa } from "./pages/auth/SetupMfa";
import { Signup } from "./pages/auth/Signup";
import { VerifyEmail } from "./pages/auth/VerifyEmail";
import { GeneratorPage } from "./pages/generator/GeneratorPage";
import { LegalPage } from "./pages/legal/LegalPage";
import { NotFound } from "./pages/NotFound";
import { Placeholder } from "./pages/Placeholder";
import { Security } from "./pages/settings/Security";
import { SettingsLayout } from "./pages/settings/SettingsLayout";
import { VaultData } from "./pages/settings/VaultData";
import { Dashboard } from "./pages/vault/Dashboard";
import { EditItemRoute, NewItemRoute } from "./pages/vault/editor/ItemEditor";
import { ItemRoute } from "./pages/vault/ItemDetail";
import { VaultPage } from "./pages/vault/VaultPage";

/** A gate page, shown only while the session is at that step (guards.tsx targetFor). */
function gate(path: string, element: ReactNode) {
  return { element: <RequireStep path={path} />, children: [{ path, element }] };
}

// Route table. Auth gating is UX only; the API enforces every permission.
export const router = createBrowserRouter([
  {
    element: <AuthLayout />,
    children: [
      {
        element: <PublicOnly />,
        children: [
          { path: "/login", element: <Login /> },
          { path: "/signup", element: <Signup /> },
          { path: "/recover", element: <Recover /> },
        ],
      },
      // Reachable in any state: the email links land here.
      { path: "/check-email", element: <CheckEmail /> },
      { path: "/verify-email", element: <VerifyEmail /> },
      gate("/lock", <Lock />),
      gate("/login/mfa", <MfaChallenge />),
      gate("/setup/mfa", <SetupMfa />),
    ],
  },
  {
    // Wide card for reading documents.
    element: <AuthLayout wide />,
    children: [
      // Any state: signup links here, and documents must be readable signed out.
      { path: "/legal/:key", element: <LegalPage /> },
      gate("/accept-terms", <AcceptTerms />),
    ],
  },
  {
    path: "/",
    element: <RequireApp />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: <Navigate to="/vault" replace /> },
          {
            path: "vault",
            element: <VaultPage />,
            children: [
              { index: true, element: <Dashboard /> },
              // Static "new" ranks above the :itemId param.
              { path: "new", element: <NewItemRoute /> },
              { path: ":itemId", element: <ItemRoute /> },
              { path: ":itemId/edit", element: <EditItemRoute /> },
            ],
          },
          { path: "generator", element: <GeneratorPage /> },
          { path: "orgs", element: <Placeholder title="Organizations" phase="Phase 16" /> },
          {
            path: "settings",
            element: <SettingsLayout />,
            children: [
              { index: true, element: <Navigate to="security" replace /> },
              { path: "security", element: <Security /> },
              { path: "vault", element: <VaultData /> },
            ],
          },
          { path: "*", element: <NotFound /> },
        ],
      },
    ],
  },
]);
