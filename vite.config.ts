/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],

  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    // Vitest owns the jsdom unit layer (src/). The e2e/ specs are WebdriverIO +
    // tauri-driver against the release binary (TASK-022) - a different runner;
    // exclude them so `vitest run` never tries to load @wdio/globals in jsdom.
    // `.claude/**` also: agent worktrees are full repo copies checked out under
    // `.claude/worktrees/`, so without this every spec is collected N+1 times
    // and the e2e specs get loaded into jsdom, failing the run.
    exclude: ["**/node_modules/**", "**/dist/**", "e2e/**", ".claude/**"],
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
