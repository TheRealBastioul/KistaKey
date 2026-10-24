import { Link } from "react-router";

export function NotFound() {
  return (
    <section className="max-w-2xl">
      <h1 className="text-xl font-semibold">Page not found</h1>
      <p className="mt-2 text-sm text-muted">
        <Link to="/vault" className="text-accent underline">
          Back to the vault
        </Link>
      </p>
    </section>
  );
}
