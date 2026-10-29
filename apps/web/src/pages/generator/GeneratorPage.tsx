// /generator: the full generator (password up to 128 characters, passphrase
// up to 20 words), copy, and a history of what was copied here. History is
// in memory only (decisions §20): gone on reload and wiped when the vault
// locks. Nothing generated here is sent anywhere.
import { useSyncExternalStore } from "react";
import { GeneratorControls, useGenerator } from "../../components/GeneratorControls";
import { Button } from "../../components/ui";
import { CopyButton } from "../vault/FieldRow";
import { generatorHistory } from "./history";

export function GeneratorPage() {
  const gen = useGenerator();
  const history = useSyncExternalStore(generatorHistory.subscribe, generatorHistory.list);

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold">Generator</h1>
        <p className="text-sm text-muted">
          Generated in your browser. Copied values clear from the clipboard after 30 seconds.
        </p>
      </div>

      <section className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4">
        <GeneratorControls gen={gen} maxLength={128} maxWords={20} previewClassName="text-lg" />
        <div className="flex flex-wrap items-center gap-3">
          <CopyButton
            value={gen.value}
            label="Copy"
            onCopied={() => generatorHistory.add(gen.value)}
          />
          <Button variant="secondary" onClick={() => gen.regenerate()}>
            Regenerate
          </Button>
        </div>
      </section>

      <section className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Copied this session</h2>
          {history.length > 0 && (
            <Button variant="link" onClick={() => generatorHistory.clear()}>
              Clear
            </Button>
          )}
        </div>
        {history.length === 0 ? (
          <p className="text-sm text-muted">
            Values you copy show up here until you reload or the vault locks.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {history.map((entry) => (
              <li key={entry.id} className="flex items-center gap-3 py-2">
                <span className="min-w-0 flex-1 font-mono text-sm break-all">{entry.value}</span>
                <span className="shrink-0 text-xs text-muted">
                  {entry.at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
                <CopyButton value={entry.value} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
