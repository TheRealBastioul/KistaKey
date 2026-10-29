import { Outlet } from "react-router";
import { useAuth } from "../auth/AuthProvider";
import { Button } from "../components/ui";
import { APP_NAME } from "../config";
import { ThemeToggle } from "../theme/ThemeToggle";

/**
 * Layout for signed-out and gate pages: a centered card under the app name.
 * `wide` for reading (legal pages and the legal gate).
 */
export function AuthLayout({ wide = false }: { wide?: boolean }) {
  const { state, logout } = useAuth();
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between px-4 py-3">
        <span className="font-semibold">{APP_NAME}</span>
        <div className="flex items-center gap-3">
          {state.status === "session" && (
            <Button variant="link" onClick={() => void logout()}>
              Sign out
            </Button>
          )}
          <ThemeToggle />
        </div>
      </header>
      <main className="flex flex-1 items-start justify-center px-4 py-8 sm:items-center">
        <div
          className={`w-full rounded-lg border border-line bg-surface p-6 shadow-sm ${
            wide ? "max-w-3xl" : "max-w-md"
          }`}
        >
          <Outlet />
        </div>
      </main>
    </div>
  );
}
