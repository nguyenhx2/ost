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
