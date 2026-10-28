import { createBrowserRouter, Navigate } from "react-router";
import { AppShell } from "./layout/AppShell";
import { NotFound } from "./pages/NotFound";
import { Placeholder } from "./pages/Placeholder";

// Route table. Auth gating (Phase 3) is UX only; the API enforces every
// permission.
export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to="/vault" replace /> },
      { path: "vault", element: <Placeholder title="Vault" phase="Phase 8" /> },
      { path: "orgs", element: <Placeholder title="Organizations" phase="Phase 16" /> },
      { path: "settings", element: <Placeholder title="Settings" phase="Phase 5" /> },
      { path: "*", element: <NotFound /> },
    ],
  },
]);
