import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * WebdriverIO + tauri-driver e2e config (TASK-022).
 *
 * Targets the RELEASE binary (embedded assets loaded via `http://tauri.localhost/`).
 * Debug / `tauri dev` loads http://localhost:1420 which is BLOCKED in this
 * environment (known-issues 2026-07-11), so the debug/dev binary cannot be
 * driven here - the release binary is the ONLY drivable target.
 *
 * tauri-driver (v2.0.6) spawns the native WebView2 WebDriver (msedgedriver) and
 * proxies the session. On Windows the msedgedriver build MUST match the
 * installed WebView2 runtime; we pin a matching msedgedriver under e2e/.driver
 * and pass it via `--native-driver`.
 */

const dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(dirname, "..");

// The release binary. CARGO_TARGET_DIR is redirected to D:\t21 on this dev host
// (reuses the whisper-rs-sys build); allow an override so CI/other hosts can
// point at the in-tree target dir.
const APPLICATION =
  process.env.OST_E2E_BINARY ??
  path.resolve(repoRoot, "src-tauri", "target", "release", "ost.exe");

const NATIVE_DRIVER =
  process.env.OST_E2E_MSEDGEDRIVER ??
  path.resolve(dirname, ".driver", "msedgedriver.exe");

const TAURI_DRIVER = path.resolve(
  os.homedir(),
  ".cargo",
  "bin",
  process.platform === "win32" ? "tauri-driver.exe" : "tauri-driver",
);

let tauriDriver: ChildProcess | undefined;

export const config: WebdriverIO.Config = {
  runner: "local",
  specs: ["./specs/**/*.spec.ts"],
  maxInstances: 1,
  hostname: "127.0.0.1",
  port: 4444,
  path: "/",
  capabilities: [
    {
      // tauri-driver reads the app path from tauri:options; browserName is left
      // to the native driver (WebView2 / wry).
      "tauri:options": {
        application: APPLICATION,
      },
    } as WebdriverIO.Capabilities,
  ],
  logLevel: "info",
  waitforTimeout: 10_000,
  connectionRetryTimeout: 120_000,
  connectionRetryCount: 3,
  framework: "mocha",
  reporters: ["spec"],
  mochaOpts: {
    ui: "bdd",
    timeout: 60_000,
  },

  onPrepare() {
    if (!existsSync(APPLICATION)) {
      throw new Error(
        `Release binary not found at ${APPLICATION}. Build it first: ` +
          `npm run tauri build -- --no-bundle (via the vcvars wrapper), ` +
          `or set OST_E2E_BINARY.`,
      );
    }
    if (!existsSync(NATIVE_DRIVER)) {
      throw new Error(
        `msedgedriver not found at ${NATIVE_DRIVER}. Download the build ` +
          `matching the installed WebView2 runtime, or set OST_E2E_MSEDGEDRIVER.`,
      );
    }
  },

  beforeSession() {
    tauriDriver = spawn(TAURI_DRIVER, ["--native-driver", NATIVE_DRIVER], {
      stdio: [null, process.stdout, process.stderr],
    });
  },

  afterSession() {
    tauriDriver?.kill();
  },
};
