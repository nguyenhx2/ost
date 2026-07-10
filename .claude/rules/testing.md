# Rule: Testing

TDD (red-green-refactor) for business logic and pipeline stages; tests follow the FR
acceptance criteria.

## Layers

| Layer | Framework | Scope |
|-------|-----------|-------|
| Unit (Rust) | cargo test | pipeline stages, provider clients (mocked HTTP), key storage wrapper (mocked keyring), chunking/VAD logic |
| Unit (TS) | Vitest | hooks, lib modules, IPC wrapper (mocked invoke) |
| Integration | cargo test + wiremock | provider trait impls against recorded/mocked HTTP; STT against tiny fixture audio |
| E2E | WebdriverIO + tauri-driver | critical flows: settings/key entry, region select -> preview, overlay lifecycle |

## Non-negotiables

- Mock EVERY external provider - no real API calls in tests. Opt-in live smoke tests exist
  behind an explicit env flag (`OST_TEST_*` keys) and never run in CI by default.
- Fixture audio/images are synthetic or self-recorded; never real user content.
- Coverage threshold for business-logic modules: >= 80%.
- Performance budgets are tested: a latency benchmark (criterion) guards the STT chunk path;
  regressions beyond budget fail review.
- Run `/test` before opening a PR; red CI blocks merge.

## E2E acceptance gate (TASK-022)

WebdriverIO + tauri-driver, in `e2e/` (`npm run test:e2e`). MUST target the RELEASE binary:
debug / `tauri dev` load `http://localhost:1420` which is blocked in this env, and only the
release build embeds the frontend so the automation session can reach `http://tauri.localhost`
(known-issues 2026-07-11). tauri-driver attaches to the ONE main WebView; individual views are
driven by navigating that WebView's `?view=` query (all windows share the bundle). The pinned
`msedgedriver` under `e2e/.driver/` MUST match the installed WebView2 runtime.

Honest CI-vs-dev-host-vs-manual split - do NOT read a green e2e run as proof the capture works
unless the run actually captured:

| Spec | Drives | Where it can run |
|------|--------|------------------|
| `smoke` | tauri-driver launch + DOM access on the release binary | any host with a display + matching msedgedriver (candidate for CI once WebView2 is provisioned) |
| `settings-keys` | real `SettingsView` + real `provider_key_statuses` IPC + OS keychain; asserts masked key status, no key value on the surface | same as smoke - NO capture, portable |
| `overlay-lifecycle` | real `CaptionOverlayView` header controls keyboard-operable (open/pin/move/close/Esc) | same as smoke - NO capture. The COPY-with-content leg needs a live audio session (provider key + whisper model) -> dev host / manual only |
| `region-select` | the REAL `WindowsScreenCapturer` + `PaddleOcrEngine` via the `e2e`-feature `e2e_region_probe` command, asserting a terminal outcome (`consent-required` / `ocr-result` / `ocr-error`) and NON-HANG (owner acceptance bar) | needs a real DISPLAY and the OCR models present; the actual capture leg is DEV-HOST, not headless CI |

- `region-select` needs a binary built with `--features e2e` (adds the WebDriver-only probe;
  absent from production). The probe reuses the production capturer + rec engine - it is NOT a
  mock; `consent-required` (fail-closed, no pixels grabbed) and `ocr-result`/`ocr-error` (real
  capture ran) are all valid non-hang outcomes. A hung capturer never resolves -> Mocha timeout
  -> RED (the TASK-021 regression guard).
- CI note: a green `smoke`/`settings`/`overlay` run does NOT prove screen capture works - only
  a `region-select` run on a display-backed host with the OCR models present proves that.
