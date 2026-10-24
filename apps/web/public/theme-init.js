// Runs before first paint so the page never flashes the wrong theme.
// Must match src/theme/theme.ts (storage key + resolution rules).
(() => {
  let pref = "system";
  try {
    pref = localStorage.getItem("app.theme") || "system";
  } catch {}
  const dark =
    pref === "dark" ||
    (pref !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  const root = document.documentElement;
  root.classList.toggle("dark", dark);
  root.dataset.theme = dark ? "dark" : "light";
  root.style.colorScheme = dark ? "dark" : "light";
})();
