import { NavLink, Outlet } from "react-router";

const TABS = [
  { to: "/settings/security", label: "Security" },
  { to: "/settings/vault", label: "Import & export" },
];

/** /settings/*: tab bar over the current settings page. */
export function SettingsLayout() {
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <h1 className="text-xl font-semibold">Settings</h1>
      <nav aria-label="Settings" className="flex gap-1 border-b border-line">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) =>
              `-mb-px border-b-2 px-3 py-2 text-sm ${
                isActive ? "border-accent font-medium text-fg" : "border-transparent text-muted"
              }`
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}
