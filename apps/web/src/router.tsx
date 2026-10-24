import { createBrowserRouter, Navigate } from "react-router";
import { AppShell } from "./layout/AppShell";
import { NotFound } from "./pages/NotFound";
import { Placeholder } from "./pages/Placeholder";

// Route table. Role/auth gating added in Phase 1 is UX only; the API
// enforces every permission.
export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to="/vault" replace /> },
      { path: "vault", element: <Placeholder title="Vault" phase="Phase 2" /> },
      { path: "orgs", element: <Placeholder title="Organizations" phase="Phase 3" /> },
      { path: "settings", element: <Placeholder title="Settings" phase="Phase 1" /> },
      { path: "*", element: <NotFound /> },
    ],
  },
]);
