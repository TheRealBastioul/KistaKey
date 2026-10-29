import { NavLink, Outlet } from "react-router";
import { ApiStatus } from "../components/ApiStatus";
import { APP_NAME } from "../config";
import { ThemeToggle } from "../theme/ThemeToggle";
import { UserMenu } from "./UserMenu";

const NAV = [
  { to: "/vault", label: "Vault" },
  { to: "/generator", label: "Generator" },
  { to: "/orgs", label: "Organizations" },
  { to: "/settings", label: "Settings" },
];

/** Layout for every signed-in page: top bar, side nav, content, footer. */
export function AppShell() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between border-b border-line bg-surface px-4 py-3">
        <span className="font-semibold">{APP_NAME}</span>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <UserMenu />
        </div>
      </header>

      <div className="flex flex-1 flex-col md:flex-row">
        <nav
          aria-label="Main"
          className="flex gap-1 border-b border-line bg-surface p-2 md:w-52 md:flex-col md:border-r md:border-b-0"
        >
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `rounded-md px-3 py-2 text-sm ${
                  isActive ? "bg-accent text-accent-fg" : "text-muted hover:bg-bg hover:text-fg"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <main className="flex-1 p-4 md:p-6">
          <Outlet />
        </main>
      </div>

      <footer className="border-t border-line bg-surface px-4 py-2">
        <ApiStatus />
      </footer>
    </div>
  );
}
