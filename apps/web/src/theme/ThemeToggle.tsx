import { useTheme } from "./ThemeProvider";
import type { ThemePreference } from "./theme";

const OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "system", label: "System" },
  { value: "dark", label: "Dark" },
];

export function ThemeToggle() {
  const { preference, setPreference } = useTheme();

  return (
    <fieldset className="inline-flex rounded-md border border-line p-0.5 text-xs">
      <legend className="sr-only">Theme</legend>
      {OPTIONS.map((opt) => (
        <label
          key={opt.value}
          className={`cursor-pointer rounded px-2 py-1 ${
            preference === opt.value ? "bg-accent text-accent-fg" : "text-muted hover:text-fg"
          }`}
        >
          <input
            type="radio"
            name="theme"
            value={opt.value}
            checked={preference === opt.value}
            onChange={() => setPreference(opt.value)}
            className="sr-only"
          />
          {opt.label}
        </label>
      ))}
    </fieldset>
  );
}
