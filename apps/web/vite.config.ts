/// <reference types="vitest/config" />
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@iris/shared-types": fileURLToPath(new URL("../../packages/shared-types/src/index.ts", import.meta.url)),
    },
  },
  server: {
    host: true,
    port: 5173,
    // docker-compose maps this exact port, fail loudly instead of quietly
    // moving to another one if it's taken.
    strictPort: true,
    // Docker Desktop on Windows doesn't forward file system events through
    // the bind mount, so Vite needs polling to notice changes.
    watch: {
      usePolling: true,
      interval: 300,
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
  },
});
