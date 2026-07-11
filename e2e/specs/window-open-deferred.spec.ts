import { browser } from "@wdio/globals";

/**
 * TASK-027 REGRESSION GUARD - the owner-confirmed hang: clicking "Start audio
 * session" INSIDE the Settings window hung the app hard, because
 * `open_caption_overlay` (and every other window-creation site - settings,
 * history, region select/preview) called `WebviewWindowBuilder::build()`
 * directly inside its `#[tauri::command]` handler when invoked from a
 * WebView's own IPC callback. On Windows that reenters the WebView2
 * `wait_with_pump` message pump and deadlocks on the non-reentrant
 * `WebviewWrapper` mutex - the same reentrant deadlock class TASK-023 fixed
 * for region-preview ONLY (by deferring to the region-select window's
 * `Destroyed` event). TASK-027 generalizes the fix (`shell::windows::
 * open_deferred`) to every window-creation site.
 *
 * This spec drives `open_caption_overlay`, `open_settings`, and `open_history`
 * FROM A REAL WEBVIEW IPC CALLBACK - the app's own main-window WebView, via
 * `__TAURI_INTERNALS__.invoke`, exactly the call path a human click inside
 * Settings makes - and proves BOTH halves of the fix:
 *   1. the app stays responsive throughout (no hang);
 *   2. the deferred build actually PRODUCES the window it scheduled (the
 *      non-hang alone would also be true of a build that silently failed).
 *
 * Instrumentation mirrors region-select.spec.ts's TASK-023 regression guard
 * for the fire-and-forget opens (awaiting a window-creating invoke's response
 * would stall the msedgedriver ASYNC channel once a satellite WebView exists
 * - a documented single-WebView driver limit, not an app hang): fire without
 * awaiting, then prove liveness with a SYNC `executeScript` round-trip
 * serviced by the app's own WebView host - the wry event-loop UI thread
 * (thread 0), the EXACT thread the reentrant deadlock parks in
 * `WebviewWrapper::drop`. The window-label check uses the e2e-only
 * `e2e_list_window_labels` command (mirrors `e2e_region_probe`) via an
 * AWAITED invoke, which this spec confirms stays reliable even after
 * satellite windows exist (unlike the fullscreen overlay create+destroy
 * transition TASK-023 guards, opening a normal decorated window does not
 * degrade the driver's async channel).
 */

async function fireInvoke(
  cmd: string,
  args: Record<string, unknown>,
): Promise<void> {
  await browser.execute(
    (command, params) => {
      const internals = (
        window as unknown as {
          __TAURI_INTERNALS__?: {
            invoke: (c: string, a: unknown) => Promise<unknown>;
          };
        }
      ).__TAURI_INTERNALS__;
      // Intentionally NOT returned/awaited: the command runs on the core
      // while this script returns immediately (see module doc).
      void internals?.invoke(command, params);
    },
    cmd,
    args,
  );
}

async function invokeRust<T>(
  cmd: string,
  args: Record<string, unknown>,
): Promise<T> {
  return browser.executeAsync<T, [string, Record<string, unknown>]>(
    (command, params, done) => {
      const internals = (
        window as unknown as {
          __TAURI_INTERNALS__?: {
            invoke: (c: string, a: unknown) => Promise<T>;
          };
        }
      ).__TAURI_INTERNALS__;
      if (!internals) {
        done("NO_TAURI_INTERNALS" as unknown as T);
        return;
      }
      internals
        .invoke(command, params)
        .then((r) => done(r))
        .catch((e) => done(`INVOKE_ERROR:${String(e)}` as unknown as T));
    },
    cmd,
    args,
  );
}

/**
 * SYNCHRONOUS liveness probe - see module doc for why sync, not async.
 */
async function livenessProbeMs(): Promise<number> {
  const started = Date.now();
  const ok = await browser.execute(
    () =>
      typeof (window as unknown as { __TAURI_INTERNALS__?: unknown })
        .__TAURI_INTERNALS__ !== "undefined",
  );
  if (!ok) throw new Error("Tauri bridge vanished after the transition");
  return Date.now() - started;
}

/** The e2e-only window-label observability command (absent in production). */
async function openWindowLabels(): Promise<string[]> {
  return invokeRust<string[]>("e2e_list_window_labels", {});
}

const CAPTION_REQUEST = { provider: "gemini", model: "gemini-2.5-flash" };

describe("window-open commands survive being invoked from a WebView IPC callback", () => {
  before(async () => {
    // Land on the app's tauri origin so __TAURI_INTERNALS__ is injected.
    await browser.waitUntil(
      async () =>
        browser.execute(
          () =>
            !!(window as unknown as { __TAURI_INTERNALS__?: unknown })
              .__TAURI_INTERNALS__,
        ),
      {
        timeout: 30_000,
        interval: 500,
        timeoutMsg: "Tauri bridge not injected",
      },
    );
  });

  it("open_caption_overlay does not hang the app and actually builds the window", async function () {
    this.timeout(30_000);
    await fireInvoke("open_caption_overlay", { request: CAPTION_REQUEST });
    await browser.pause(2000); // let the deferred build run.

    const probeMs = await livenessProbeMs();
    console.log(
      `[window-open] caption liveness probe returned in ${probeMs}ms`,
    );
    await expect(probeMs).toBeLessThan(15_000);

    const labels = await openWindowLabels();
    console.log(`[window-open] labels after caption open: ${labels}`);
    await expect(labels).toContain("caption-overlay");

    // Clean up so later assertions start from a known state.
    await fireInvoke("close_caption_overlay", {});
    await browser.pause(1000);
  });

  it("open_settings does not hang the app and actually builds the window", async function () {
    this.timeout(30_000);
    await fireInvoke("open_settings", {});
    await browser.pause(2000);

    const probeMs = await livenessProbeMs();
    console.log(
      `[window-open] settings liveness probe returned in ${probeMs}ms`,
    );
    await expect(probeMs).toBeLessThan(15_000);

    const labels = await openWindowLabels();
    console.log(`[window-open] labels after settings open: ${labels}`);
    await expect(labels).toContain("settings");
  });

  it("open_history does not hang the app and actually builds the window", async function () {
    this.timeout(30_000);
    await fireInvoke("open_history", {});
    await browser.pause(2000);

    const probeMs = await livenessProbeMs();
    console.log(
      `[window-open] history liveness probe returned in ${probeMs}ms`,
    );
    await expect(probeMs).toBeLessThan(15_000);

    const labels = await openWindowLabels();
    console.log(`[window-open] labels after history open: ${labels}`);
    await expect(labels).toContain("history");
  });

  it("survives opening all three again in one burst (not one-shot survival)", async function () {
    this.timeout(30_000);
    await fireInvoke("open_caption_overlay", { request: CAPTION_REQUEST });
    await fireInvoke("open_settings", {});
    await fireInvoke("open_history", {});
    await browser.pause(2500);

    const probeMs = await livenessProbeMs();
    console.log(
      `[window-open] second-round liveness probe returned in ${probeMs}ms`,
    );
    await expect(probeMs).toBeLessThan(15_000);

    const labels = await openWindowLabels();
    console.log(`[window-open] labels after second-round open: ${labels}`);
    await expect(labels).toContain("caption-overlay");
    await expect(labels).toContain("settings");
    await expect(labels).toContain("history");

    await fireInvoke("close_caption_overlay", {});
  });
});
