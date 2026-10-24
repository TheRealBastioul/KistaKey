/** Stand-in for pages built in later phases. */
export function Placeholder({ title, phase }: { title: string; phase: string }) {
  return (
    <section className="max-w-2xl">
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="mt-2 text-sm text-muted">Coming in {phase}.</p>
    </section>
  );
}
