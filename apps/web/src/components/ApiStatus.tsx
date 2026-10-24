import { HealthReadyResponseSchema } from "@repo/types";
import { useEffect, useState } from "react";

type Status = "checking" | "ok" | "degraded" | "offline";

const LABELS: Record<Status, string> = {
  checking: "Checking API…",
  ok: "API ok",
  degraded: "API degraded",
  offline: "API offline",
};

const DOT: Record<Status, string> = {
  checking: "bg-muted",
  ok: "bg-ok",
  degraded: "bg-bad",
  offline: "bg-bad",
};

const POLL_MS = 10_000;

/**
 * Dev aid: shows whether the API and its dependencies are reachable.
 * Re-checks every 10s, so it recovers on its own when the API starts
 * after the page (common with `pnpm dev`) or restarts.
 */
export function ApiStatus() {
  const [status, setStatus] = useState<Status>("checking");

  useEffect(() => {
    const controller = new AbortController();

    const check = () =>
      fetch("/api/health/ready", { signal: controller.signal })
        .then(async (res) => {
          const parsed = HealthReadyResponseSchema.safeParse(await res.json());
          setStatus(parsed.success ? parsed.data.status : "offline");
        })
        .catch(() => {
          if (!controller.signal.aborted) setStatus("offline");
        });

    check();
    const timer = setInterval(check, POLL_MS);
    return () => {
      clearInterval(timer);
      controller.abort();
    };
  }, []);

  return (
    <span className="inline-flex items-center gap-2 text-xs text-muted">
      <span className={`size-2 rounded-full ${DOT[status]}`} aria-hidden="true" />
      {LABELS[status]}
    </span>
  );
}
