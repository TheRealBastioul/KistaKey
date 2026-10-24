import type { Logger } from "pino";

const SHUTDOWN_TIMEOUT_MS = 10_000;

/**
 * Runs `cleanup` once on SIGINT/SIGTERM (close the server, drain workers,
 * disconnect DB/Redis), then exits. Forces exit if cleanup hangs, so a
 * deploy never waits forever on a stuck connection.
 */
export function onShutdown(log: Logger, cleanup: () => Promise<void>): void {
  let shuttingDown = false;

  const handler = (signal: NodeJS.Signals) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info({ signal }, "shutting down");

    const timer = setTimeout(() => {
      log.error("shutdown timed out, forcing exit");
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    timer.unref();

    cleanup()
      .then(() => process.exit(0))
      .catch((err: unknown) => {
        log.error({ err }, "error during shutdown");
        process.exit(1);
      });
  };

  process.on("SIGINT", handler);
  process.on("SIGTERM", handler);
}
