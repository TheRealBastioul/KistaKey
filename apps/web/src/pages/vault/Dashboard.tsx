// Right pane when no item is open: password health (weak / reused / old,
// computed in the browser, each linking to its filter), favorites and
// recently used items (this unlock only; recent uses live in memory). In
// dev an empty vault offers sample items.
import { type ReactNode, useState } from "react";
import { Link } from "react-router";
import { errorMessage } from "../../api/client";
import { Alert, Button } from "../../components/ui";
import { type HealthIssue, OLD_AFTER_DAYS } from "../../vault/health";
import type { VaultEntry } from "../../vault/store";
import { useHealth } from "../../vault/useHealth";
import { useVault } from "../../vault/useVault";
import { useVaultParams } from "./useVaultParams";

const ISSUE_TEXT: Record<HealthIssue, { label: string; hint: string }> = {
  weak: { label: "Weak", hint: "Easy to guess. Generate a new one." },
  reused: { label: "Reused", hint: "Used on more than one item: one leak exposes them all." },
  old: {
    label: "Old",
    hint: `Not changed in over ${Math.round(OLD_AFTER_DAYS / 30)} months.`,
  },
};

function HealthCard() {
  const health = useHealth();
  const { filterHref } = useVaultParams();
  const report = health.report;

  let body: ReactNode;
  if (health.status === "loading") {
    body = <p className="text-sm text-muted">Checking your passwords…</p>;
  } else if (!report) {
    body = <p className="text-sm text-muted">Couldn't load the password checker.</p>;
  } else if (report.checked === 0) {
    body = <p className="text-sm text-muted">No login passwords to check yet.</p>;
  } else {
    const counts: Record<HealthIssue, number> = {
      weak: report.weak.length,
      reused: report.reusedGroups.reduce((n, group) => n + group.length, 0),
      old: report.old.length,
    };
    const flagged = report.issues.size;
    body = (
      <>
        <p className="mb-3 text-sm text-muted">
          {flagged === 0
            ? `All ${report.checked} passwords look good.`
            : `${flagged} of ${report.checked} passwords need attention.`}{" "}
          Checked on this device only; nothing is sent anywhere.
        </p>
        <ul className="grid gap-2 sm:grid-cols-3">
          {(Object.keys(ISSUE_TEXT) as HealthIssue[]).map((issue) => (
            <li key={issue}>
              <Link
                to={filterHref({ kind: "health", issue })}
                title={ISSUE_TEXT[issue].hint}
                className="flex flex-col rounded-md border border-line p-3 hover:bg-bg"
              >
                <span className={`text-2xl font-semibold ${counts[issue] ? "text-bad" : ""}`}>
                  {counts[issue]}
                </span>
                <span className="text-sm">{ISSUE_TEXT[issue].label}</span>
                <span className="text-xs text-muted">{ISSUE_TEXT[issue].hint}</span>
              </Link>
            </li>
          ))}
        </ul>
      </>
    );
  }

  return (
    <section className="rounded-lg border border-line bg-surface p-4">
      <h2 className="mb-2 text-sm font-semibold">Password health</h2>
      {body}
    </section>
  );
}

function EntryList({
  title,
  entries,
  empty,
}: {
  title: string;
  entries: VaultEntry[];
  empty: string;
}) {
  const { itemHref } = useVaultParams();
  return (
    <section className="rounded-lg border border-line bg-surface p-4">
      <h2 className="mb-2 text-sm font-semibold">{title}</h2>
      {entries.length === 0 ? (
        <p className="text-sm text-muted">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {entries.map((entry) => (
            <li key={entry.id}>
              <Link to={itemHref(entry.id)} className="text-sm text-accent hover:underline">
                {entry.name}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function DevSeed() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <section className="flex flex-col gap-2 rounded-lg border border-dashed border-line p-4">
      <p className="text-sm text-muted">
        Dev only: your vault is empty. Add a folder and five sample items (encrypted like any other)
        to try the vault pages.
      </p>
      {error && <Alert tone="error">{error}</Alert>}
      <Button
        variant="secondary"
        className="self-start"
        busy={busy && "Adding…"}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            const { seedSampleVault } = await import("../../vault/devSeed");
            await seedSampleVault();
          } catch (err) {
            setError(errorMessage(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        Add sample items
      </Button>
    </section>
  );
}

export function Dashboard() {
  const vault = useVault();
  const live = vault.items.filter((e) => e.deletedAt === null);
  const favorites = live.filter((e) => e.data?.favorite);
  const recent = vault.recent
    .map((id) => live.find((e) => e.id === id))
    .filter((e): e is VaultEntry => e !== undefined);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold">Your vault</h1>
      <p className="text-sm text-muted">
        {live.length} {live.length === 1 ? "item" : "items"}. Pick one from the list to see it.
      </p>
      {import.meta.env.DEV && vault.items.length === 0 && <DevSeed />}
      <HealthCard />
      <EntryList title="Favorites" entries={favorites} empty="Star items to see them here." />
      <EntryList
        title="Recently used"
        entries={recent}
        empty="Items you copy from or reveal show up here until the vault locks."
      />
    </div>
  );
}
