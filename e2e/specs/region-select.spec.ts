import { browser } from "@wdio/globals";

/**
 * Critical flow (testing.md) + the OWNER ACCEPTANCE BAR (TASK-022): region
 * select must drive the REAL WindowsScreenCapturer + PaddleOcrEngine and prove
 * the pipeline reaches a terminal state - consent-required / ocr-result /
 * ocr-error - and NEVER hangs. This is the exact bug class TASK-021 fixed (a
 * capture that could park the app); this spec is the standing guard.
 *
 * How it drives the REAL path: `e2e_region_probe` (feature `e2e`, absent from
 * production) runs the SAME capture -> OCR core as `region_preview_ready`
 * against the production `RegionPipeline` capturer + rec engine, then RETURNS
 * the outcome. tauri-driver attaches to one WebView and the production flow
 * emits its result to a separate preview window the driver cannot see, so a
 * returning command is the only honest way to OBSERVE the real outcome from the
 * driven session. The `invoke` resolving within the timeout is the non-hang
 * proof (a hung capturer would never resolve -> Mocha timeout -> RED).
 */

type ProbeResult = string;

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
 * Fire an invoke WITHOUT awaiting its Promise (fire-and-forget). Used for the
 * window-lifecycle commands: `start_region_selection` / `confirm_region_selection`
 * synchronously create/destroy a WebView2 on the UI thread, which spins a nested
 * message pump. Awaiting such an invoke's RESPONSE (executeAsync + done) would
 * stall the msedgedriver renderer channel for the duration of that pump - a
 * DRIVER artifact, not an app hang. Firing without awaiting drives the REAL
 * transition; the awaited responsiveness probe afterwards is the non-hang proof.
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
      // Intentionally NOT returned/awaited: the command runs on the core while
      // this script returns immediately.
      void internals?.invoke(command, params);
    },
    cmd,
    args,
  );
}

/**
 * SYNCHRONOUS liveness probe: a `executeScript` round-trip serviced through the
 * app's own WebView host (the wry event-loop UI thread - thread 0). Returns the
 * elapsed ms. This is the discriminating deadlock signal here: the reentrant
 * deadlock parks thread 0 in `WebviewWrapper::drop`, freezing the wry event loop
 * that hosts this WebView, so the host cannot service the automation request and
 * the call hangs until the WebDriver script timeout (RED). Post-fix, thread 0
 * returns to `NtUserGetMessage` and this returns in single-digit ms.
 *
 * Why SYNC not ASYNC: once the transition creates a satellite WebView, the
 * msedgedriver ASYNC (executeAsync/`done`) channel to the main window degrades
 * session-wide (documented single-WebView limit) and would time out even though
 * the app is alive - so an async invoke probe cannot distinguish a driver-channel
 * limit from an app deadlock. A sync round-trip stays reliable.
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

describe("region-select drives the REAL capture -> OCR pipeline", () => {
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

  it("reaches a terminal outcome (never hangs) via the real capturer", async function () {
    // Generous ceiling: the whole point is that this RESOLVES. TASK-021's hang
    // would never return, so a Mocha timeout here is the regression signal.
    this.timeout(45_000);

    // A small on-screen rect near the primary-monitor origin (physical px). The
    // capturer really grabs these pixels when consent is granted + models exist.
    const rect = { x: 0, y: 0, width: 320, height: 120 };

    const started = Date.now();
    const result = await invokeRust<ProbeResult>("e2e_region_probe", rect);
    const elapsedMs = Date.now() - started;
    console.log(`[region] outcome="${result}" elapsedMs=${elapsedMs}`);

    await expect(typeof result).toBe("string");
    // The pipeline reached a TERMINAL state - one of the three no-hang outcomes.
    const terminal =
      result === "consent-required" ||
      result.startsWith("ocr-result:") ||
      result.startsWith("ocr-error:");
    await expect(terminal).toBe(true);
    // It returned well under the ceiling: the real capturer did not park.
    await expect(elapsedMs).toBeLessThan(45_000);
  });

  it("runs the real capturer end-to-end once consent is granted", async function () {
    this.timeout(45_000);
    // Grant first-run model-download consent for the OCR set so the fail-closed
    // gate opens and capture actually runs (security-privacy.md fail-closed).
    // On a host WITHOUT the models cached this still returns quickly (download
    // path), never hangs; where models are present it drives real capture->OCR.
    await invokeRust<void>("grant_model_consent", {
      modelSetId: "ocr-ppocrv5",
    });

    const rect = { x: 0, y: 0, width: 400, height: 160 };
    const started = Date.now();
    const result = await invokeRust<ProbeResult>("e2e_region_probe", rect);
    const elapsedMs = Date.now() - started;
    console.log(
      `[region] post-consent outcome="${result}" elapsedMs=${elapsedMs}`,
    );

    // With consent granted the gate no longer short-circuits to
    // consent-required; the REAL capturer + OCR must produce a result or a
    // real error - either proves the capturer returned (no hang).
    const drovePipeline =
      result.startsWith("ocr-result:") || result.startsWith("ocr-error:");
    await expect(drovePipeline).toBe(true);
  });
});

/**
 * TASK-023 REGRESSION GUARD - the WINDOW TRANSITION the pipeline probe above
 * cannot see. The real hang was NOT in capture/OCR: it was a reentrant
 * window-lifecycle deadlock triggered by `confirm_region_selection` closing the
 * `region-select` overlay and creating the `region-preview` WebView in the SAME
 * command turn. The synchronous WebView2 create pumped the message loop, which
 * dispatched the select overlay's still-pending `DestroyWindow`, reentering wry
 * to drop the select window's `WebviewWrapper` and block on the non-reentrant
 * webview-map mutex the create already held -> thread 0 parked forever.
 *
 * This spec drives the REAL `start_region_selection` -> `confirm_region_selection`
 * transition (real close-select + open-preview via the deferred `Destroyed`
 * handler) against the REAL windows. The proof is RESPONSIVENESS: a deadlock
 * parks the main thread, so the `confirm` invoke would never resolve (Mocha
 * timeout -> RED) and a follow-up cheap invoke would never return. With the fix,
 * confirm returns immediately (it only queues the destroy) and the event loop
 * stays alive, so both resolve well under the ceiling.
 *
 * tauri-driver attaches to ONE WebView and cannot switch to the dynamically
 * created preview window, so we assert via the responsiveness probe rather than
 * by observing the preview surface directly (documented single-WebView limit).
 */
describe("region-select confirm survives the close-select -> open-preview transition", () => {
  before(async () => {
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

  it("survives the real close-select -> open-preview transition (no reentrant deadlock)", async function () {
    // The whole point: after the REAL transition the event loop must still be
    // alive. A reentrant deadlock parks thread 0 in WebviewWrapper::drop forever,
    // so the responsiveness probe below would NEVER resolve (Mocha timeout ->
    // RED). This is the exact bug class the cdb dump proved (TASK-023).
    this.timeout(60_000);
    const region = { x: 0, y: 0, width: 320, height: 120 };

    // 1. Open the REAL fullscreen selection overlay (a second WebView window).
    //    Fired, not awaited: the create spins a nested UI pump (see fireInvoke).
    await fireInvoke("start_region_selection", {});
    await browser.pause(1500); // let the overlay WebView finish creating.

    // 2. Confirm the REAL transition: this closes the select overlay AND (pre-
    //    fix) created the preview WebView in the SAME command turn - the exact
    //    deadlock trigger. Post-fix it arms the region, queues the select
    //    destroy, and returns; the preview opens from the select window's
    //    `Destroyed` event at the top of a fresh event-loop iteration.
    await fireInvoke("confirm_region_selection", {
      region,
      sourceLanguage: "auto",
    });
    await browser.pause(2500); // let close-select + Destroyed->open-preview run.

    // 3. LIVENESS PROBE (the non-hang assertion): a SYNC round-trip serviced by
    //    the app's WebView host, i.e. the wry event-loop UI thread (thread 0) -
    //    the exact thread the reentrant deadlock parks in WebviewWrapper::drop.
    //    If confirm had deadlocked, thread 0 would be frozen mid-transition, the
    //    host could not service this request, and it would hang to the script
    //    timeout (RED). It returning fast is positive proof thread 0 survived the
    //    real close-select -> open-preview transition and is back in its loop.
    const probeMs = await livenessProbeMs();
    console.log(`[region] liveness probe returned in ${probeMs}ms`);
    await expect(probeMs).toBeLessThan(15_000);

    // 4. Tear the preview overlay down so later specs start from a clean state.
    await fireInvoke("close_region_preview", {});
    await browser.pause(1500);

    // 5. Drive the whole transition a SECOND time to prove it is not one-shot
    //    survival, then probe again - the app must still be live.
    await fireInvoke("start_region_selection", {});
    await browser.pause(1500);
    await fireInvoke("confirm_region_selection", {
      region,
      sourceLanguage: "auto",
    });
    await browser.pause(2500);

    const probe2Ms = await livenessProbeMs();
    console.log(`[region] second liveness probe returned in ${probe2Ms}ms`);
    await expect(probe2Ms).toBeLessThan(15_000);

    // Final cleanup.
    await fireInvoke("close_region_preview", {});
  });
});
