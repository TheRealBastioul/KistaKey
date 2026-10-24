import { defineConfig } from "tsup";

// Bundles the API + worker entry points. The @repo/* workspace packages
// ship TypeScript source, so they're bundled in (noExternal); npm
// dependencies stay external and load from node_modules at runtime.
export default defineConfig({
  entry: ["src/server.ts", "src/worker.ts"],
  format: "esm",
  platform: "node",
  target: "node24",
  outDir: "dist",
  sourcemap: true,
  clean: true,
  noExternal: [/^@repo\//],
});
