/// <reference types="vitest/config" />
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // The web app calls /api/*; in dev that's proxied to the API, so the
    // browser sees one origin (no CORS, first-party session cookies).
    proxy: {
      "/api": {
        // 127.0.0.1, not localhost: on Windows, Node resolves localhost to
        // ::1 (IPv6) first, but the API listens on IPv4.
        target: "http://127.0.0.1:3000",
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
  // The crypto Web Worker (src/crypto/worker.ts) is an ES module worker.
  worker: { format: "es" },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
