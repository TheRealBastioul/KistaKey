import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    // Migrates TEST_DATABASE_URL before integration tests (no-op if unset).
    globalSetup: ["test/setup/migrate-test-db.ts"],
    // Integration files share one test DB and Redis, and each harness flushes
    // Redis on start: run files one at a time.
    fileParallelism: false,
  },
});
