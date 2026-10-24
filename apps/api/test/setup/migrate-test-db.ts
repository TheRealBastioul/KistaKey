// Vitest global setup: applies migrations to TEST_DATABASE_URL before the
// integration tests run. Skipped (and those tests skip) when it's unset.
import "dotenv/config";
import { execSync } from "node:child_process";

export default function setup(): void {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) return;
  if (url === process.env.DATABASE_URL) {
    throw new Error("TEST_DATABASE_URL must not be the dev database (audit_log is append-only)");
  }
  execSync("pnpm exec prisma migrate deploy", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: url },
  });
}
