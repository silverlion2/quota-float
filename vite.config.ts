import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  envPrefix: ["VITE_", "TAURI_ENV_"],
  build: {
    manifest: true,
    rollupOptions: {
      input: "index.html",
      output: {
        // These native bridge modules load together; one chunk avoids tiny-file overhead.
        manualChunks: { "tauri-api": ["@tauri-apps/api/core", "@tauri-apps/api/window", "@tauri-apps/api/event", "@tauri-apps/api/app", "@tauri-apps/api/image"] },
      },
    },
  },
  test: {
    exclude: ["node_modules/**", "dist/**", "release/**", "outputs/**", "src-tauri/target/**", "test/e2e/**"],
    // jsdom component suites can exhaust Windows worker resources at Vitest's
    // machine-derived default. Two workers keep the full suite deterministic.
    maxWorkers: 2,
  },
});
