import type { Strength } from "../auth/passwordStrength";

const BAR_COLORS = ["bg-bad", "bg-bad", "bg-muted", "bg-ok", "bg-ok"] as const;

/** Four-segment bar + label + the top suggestion. */
export function StrengthMeter({ strength }: { strength: Strength }) {
  const color = BAR_COLORS[strength.score];
  return (
    <div className="flex flex-col gap-1" aria-live="polite">
      <div className="flex gap-1" aria-hidden="true">
        {[1, 2, 3, 4].map((segment) => (
          <span
            key={segment}
            className={`h-1.5 flex-1 rounded-full ${segment <= strength.score ? color : "bg-line"}`}
          />
        ))}
      </div>
      <p className="text-xs text-muted">
        Strength: <span className="font-medium text-fg">{strength.label}</span>
        {strength.suggestions[0] ? ` · ${strength.suggestions[0]}` : null}
      </p>
    </div>
  );
}
