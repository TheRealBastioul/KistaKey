// Password / passphrase generator state and controls, shared by the editor's
// "Generate" popover and the /generator page. The generator is
// @repo/crypto/generator (getRandomValues + rejection sampling, no
// libsodium), so it runs on this thread. Options are remembered (in memory,
// shared by both places) until the page reloads.
import {
  DEFAULT_PASSPHRASE_OPTIONS,
  DEFAULT_PASSWORD_OPTIONS,
  GENERATOR_LIMITS,
  generatedEntropyBits,
  generatePassphrase,
  generatePassword,
  type PassphraseOptions,
  type PasswordOptions,
} from "@repo/crypto/generator";
import { useCallback, useEffect, useId, useState } from "react";

export type GeneratorOptions =
  | ({ kind: "password" } & PasswordOptions)
  | ({ kind: "passphrase" } & PassphraseOptions);

let remembered: {
  password: PasswordOptions;
  passphrase: PassphraseOptions;
  kind: GeneratorOptions["kind"];
} = {
  password: { ...DEFAULT_PASSWORD_OPTIONS },
  passphrase: { ...DEFAULT_PASSPHRASE_OPTIONS },
  kind: "password",
};

export function generate(options: GeneratorOptions): string {
  return options.kind === "password" ? generatePassword(options) : generatePassphrase(options);
}

export function strengthLabel(bits: number): string {
  if (bits < 50) return "weak";
  if (bits < 75) return "fair";
  if (bits < 100) return "strong";
  return "very strong";
}

const SETS = [
  ["lowercase", "a–z"],
  ["uppercase", "A–Z"],
  ["digits", "0–9"],
  ["symbols", "!#$…"],
] as const;

/** Generator state: options, the current value (regenerated on every option change). */
export function useGenerator() {
  const [kind, setKind] = useState(remembered.kind);
  const [password, setPassword] = useState(remembered.password);
  const [passphrase, setPassphrase] = useState(remembered.passphrase);
  const options: GeneratorOptions =
    kind === "password" ? { kind, ...password } : { kind: "passphrase", ...passphrase };
  const [value, setValue] = useState(() => generate(options));

  // biome-ignore lint/correctness/useExhaustiveDependencies: `options` is rebuilt every render from these
  useEffect(() => {
    remembered = { kind, password, passphrase };
    setValue(generate(options));
  }, [kind, password, passphrase]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: same as above
  const regenerate = useCallback(() => {
    const next = generate(options);
    setValue(next);
    return next;
  }, [kind, password, passphrase]);

  return {
    kind,
    setKind,
    password,
    setPassword,
    passphrase,
    setPassphrase,
    options,
    value,
    regenerate,
    bits: Math.round(generatedEntropyBits(options)),
  };
}

export type Generator = ReturnType<typeof useGenerator>;

function Check({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}

/**
 * Kind tabs, the preview with its strength, and the options. `maxLength` /
 * `maxWords` cap the sliders (the popover keeps them short; the page allows
 * the generator's full range).
 */
export function GeneratorControls({
  gen,
  maxLength = 64,
  maxWords = 10,
  previewClassName = "text-sm",
}: {
  gen: Generator;
  maxLength?: number;
  maxWords?: number;
  previewClassName?: string;
}) {
  const { kind, setKind, password, setPassword, passphrase, setPassphrase, value, bits } = gen;
  const sliderId = useId();
  const enabledSets = SETS.filter(([name]) => password[name]).length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-1 rounded-md border border-line p-0.5 text-sm" role="tablist">
        {(["password", "passphrase"] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={kind === k}
            onClick={() => setKind(k)}
            className={`flex-1 rounded px-2 py-1 ${kind === k ? "bg-accent text-accent-fg" : ""}`}
          >
            {k === "password" ? "Password" : "Passphrase"}
          </button>
        ))}
      </div>

      <output
        className={`rounded-md border border-line bg-bg px-3 py-2 font-mono break-all ${previewClassName}`}
      >
        {value}
      </output>
      <p className="text-xs text-muted">
        About {bits} bits of randomness ({strengthLabel(bits)}).
      </p>

      {kind === "password" ? (
        <>
          <label htmlFor={sliderId} className="flex items-center justify-between text-sm">
            Length <span className="font-mono">{password.length}</span>
          </label>
          <input
            id={sliderId}
            type="range"
            min={GENERATOR_LIMITS.length.min}
            max={maxLength}
            value={Math.min(password.length, maxLength)}
            onChange={(e) => setPassword({ ...password, length: Number(e.target.value) })}
          />
          <div className="grid grid-cols-2 gap-1">
            {SETS.map(([name, label]) => (
              <Check
                key={name}
                label={label}
                checked={password[name]}
                // At least one set stays on.
                disabled={password[name] && enabledSets === 1}
                onChange={(checked) => {
                  const next = { ...password };
                  next[name] = checked;
                  setPassword(next);
                }}
              />
            ))}
          </div>
          <Check
            label="Avoid look-alikes (I l 1 O 0 o)"
            checked={password.avoidAmbiguous}
            onChange={(checked) => setPassword({ ...password, avoidAmbiguous: checked })}
          />
        </>
      ) : (
        <>
          <label htmlFor={sliderId} className="flex items-center justify-between text-sm">
            Words <span className="font-mono">{passphrase.words}</span>
          </label>
          <input
            id={sliderId}
            type="range"
            min={GENERATOR_LIMITS.words.min}
            max={maxWords}
            value={Math.min(passphrase.words, maxWords)}
            onChange={(e) => setPassphrase({ ...passphrase, words: Number(e.target.value) })}
          />
          <label className="flex items-center gap-2 text-sm">
            Separator
            <input
              value={passphrase.separator}
              maxLength={GENERATOR_LIMITS.separatorChars.max}
              onChange={(e) =>
                setPassphrase({
                  ...passphrase,
                  separator: [...e.target.value]
                    .slice(0, GENERATOR_LIMITS.separatorChars.max)
                    .join(""),
                })
              }
              className="w-16 rounded-md border border-line bg-bg px-2 py-1 font-mono text-sm"
            />
          </label>
          <Check
            label="Capitalize words"
            checked={passphrase.capitalize}
            onChange={(checked) => setPassphrase({ ...passphrase, capitalize: checked })}
          />
          <Check
            label="Add a number"
            checked={passphrase.includeNumber}
            onChange={(checked) => setPassphrase({ ...passphrase, includeNumber: checked })}
          />
        </>
      )}
    </div>
  );
}
