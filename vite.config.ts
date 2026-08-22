import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  envPrefix: ["VITE_", "TAURI_ENV_"],
  build: { manifest: true, rollupOptions: { input: "index.html" } },
  test: {
    exclude: ["node_modules/**", "dist/**", "release/**", "outputs/**", "src-tauri/target/**", "test/e2e/**"],
    // jsdom component suites can exhaust Windows worker resources at Vitest's
    // machine-derived default. Two workers keep the full suite deterministic.
    maxWorkers: 2,
  },
});
