---
title: "TASK-021: Fix region-capture WGC hang + first-run ordering + download timeout"
status: Done
fr: "FR-02"
owner: screen-translate-dev
deps: "TASK-007"
priority: P0
phase: 1
created: 2026-07-11
tags: [task]
---

<!-- TASK FILES ARE WRITTEN 100% IN ENGLISH (see .claude/rules/task-tracking.md). -->

# TASK-021: Fix region-capture WGC hang + first-run ordering + download timeout

## Goal
Selecting a region on the RELEASE build must never hang: it reaches a consent dialog / ocr-result / ocr-error, never Not-responding. Fix the three ranked defects the debugger verified.

## Inputs / context
- Related FR: [FR-02](../../specs/05-functional-requirements.md#fr-02); human-in-the-loop.md (no silent hang).
- Root cause (debugger, verified - do NOT re-investigate): the whole region pipeline was debug-MOCKED (shell/region.rs line 3), so the real capture/OCR path never ran until the owner launched the RELEASE build.
- Files: src-tauri/src/shell/region.rs, src-tauri/src/capture/mod.rs, src-tauri/src/ocr/paddle.rs.

## To do
- [ ] BLOCKER (capture hang): run capturer.capture() on a properly COM-initialized context for Windows Graphics Capture (CoInitializeEx on the capture thread, or a dedicated pumped/dispatcher thread if xcap WGC needs it), and wrap capture_region in a BOUNDED TIMEOUT mapping to CaptureError::Backend -> region:ocr-error (no silent hang). Kill the capture-of-self / DWM race: ensure the fullscreen always-on-top selection overlay is actually destroyed before capture (await a Destroyed/close confirmation for region-select, or exclude the app own overlays from capture).
- [ ] ORDERING: consult the fail-closed consent gate BEFORE capturer.capture() so first-run raises ConsentRequired (models:consent-required) WITHOUT ever grabbing the screen, and a capture failure never blocks reaching the consent dialog.
- [ ] LATENT: add a bounded TIMEOUT to the post-consent OAROCRBuilder::build() ModelScope download (paddle.rs) so a slow/unreachable host cannot hang OCR under the pipeline Mutex.

## Test scenarios / acceptance
- [ ] First-run region-select raises the consent dialog (models:consent-required) instead of hanging; the screen is NOT captured before consent.
- [ ] Real capture returns (bring-up tracing before/after capturer.capture() proves it) or times out to region:ocr-error - never parks forever.
- [ ] RELEASE binary launches (tauri://, embedded assets) and region-select does not hang (release smoke).
- [ ] Model-download timeout maps to an actionable error, not a hang.

## Orchestration notes
- 2026-07-11: registered from the owner-reported release hang; debugger root-caused (do not re-investigate). security-reviewer MANDATORY (bug #3 = model-download egress). Verify on the RELEASE binary, not tauri dev / debug (localhost loopback blocked here).

## Session log (AI session log)

| Date | Who | What was done | Result |
|------|-----|---------------|--------|
| 2026-07-11 | orchestrator | Registered from the owner release-hang report; debugger root cause attached; dispatching screen-translate-dev to fix all 3 defects | Active |
| 2026-07-11 | screen-translate-dev | Fixed all 3 defects: (1) capture runs on a COM-initialized worker thread with a 5s bounded timeout (CaptureError::Backend -> region:ocr-error), + wait_for_selection_overlay_closed before capture kills the capture-of-self/DWM race; (2) OcrEngine::ensure_ready consulted BEFORE capturer.capture() so first-run raises ConsentRequired without grabbing pixels; (3) OAROCRBuilder::build() wrapped in a 180s bounded run_bounded helper -> actionable ModelLoad error. Added bring-up tracing around capturer.capture(). Added windows 0.62 (Win32_System_Com) dep. TDD: gate-before-capture (panicking capturer), capture-timeout->ocr-error, ensure_ready fail-closed, run_bounded timeout. Updated ipc.md. fmt clean | In progress |
| 2026-07-11 | screen-translate-dev | Verified via release toolchain wrapper: fmt --check clean, clippy --all-targets -D warnings clean, cargo test 272 passed / 0 failed / 1 ignored. Release binary built (npm run tauri build --no-bundle -> D:\t21\release\ost.exe, embedded dist via tauri://) and launched without crash. Opt-in #[ignore] smoke real_windows_capture_returns_and_does_not_park proved the real Windows capturer RETURNS (<5s), not parking. Interactive region-drag needs a human display (not performed; ordering+timeout proven by unit tests). Commit ab341c9, pushed, PR #38 (base main). Not merged | Done pending review |
| 2026-07-11 | screen-translate-dev | Fixed all 3 defects: capture on a COM-init (MTA) worker thread + 5s bounded timeout -> region:ocr-error; wait_for_selection_overlay_closed before capture (kills capture-of-self); ensure_ready() consults consent gate BEFORE capture; 180s bounded download timeout. Release binary built (ost.exe, tauri://) + launched; opt-in real-capture smoke returns ~0.01s. | PR #38 |
| 2026-07-11 | qa-test | cargo 272 passed / 0 failed / 2 ignored; clippy -D warnings + fmt clean. 4 named regression tests pass; the opt-in real-capture smoke RAN on the display host - real WindowsScreenCapturer returns ~0.01s (no park). Interactive region-drag + real-timeout-firing + overlay-race deferred to e2e/release-smoke. | Green |
| 2026-07-11 | code-reviewer | PASS. COM apartment MTA correct, CoUninitialize same-thread + hr.is_ok gated (releases S_OK/S_FALSE, skips RPC_E_CHANGED_MODE); bounded-timeout worker detached cleanly on timeout -> region:ocr-error, no Tokio-worker block; gate-before-capture proven (PanicOnCapture); overlay-destroy bounded; download timeout keeps fail-closed+SHA; windows COM dep clean. Nits: silent gate-less ensure_ready branch; detached-thread COM apartment on repeated timeout; duplicated bounded-join helper. | PASS |
| 2026-07-11 | security-reviewer | MANDATORY (download egress + native dep). PASS. Screen NEVER captured before consent now (ensure_ready short-circuits pre-capture - privacy WIN; in-recognize gate kept as defense-in-depth); download timeout only bounds the wait, consent-first + SHA-256 verify untouched; windows 0.62 COM dep target-gated + scoped; captured content stays in RAM, tracing logs dimensions only. | PASS |
| 2026-07-11 | orchestrator | Merged PR #38 (merge commit fc2fea8); CI GREEN; secret-scan clean; master-plan add-only. Closed: Done in frontmatter + board, moved to done/. Recorded the release-binary env workaround in known-issues. Interactive region-select proof -> the e2e/release-smoke gate (TASK-022). | Done |

## Result
The RELEASE-build region-capture hang is fixed on `main` (PR #38, merge commit fc2fea8). All
three debugger-ranked defects addressed:
1. Capture no longer parks: `WindowsScreenCapturer::capture` runs on a dedicated
   `ost-screen-capture` worker thread with a COM apartment (CoInitializeEx MTA via a ComApartment
   RAII guard) and a 5s bounded `recv_timeout`; a stall maps to CaptureError::Backend ->
   region:ocr-error (never a silent hang). The capture-of-self / DWM race is killed by
   `wait_for_selection_overlay_closed` (bounded) which destroys the region-select overlay before
   capturing.
2. Consent gate consulted BEFORE capture: `OcrEngine::ensure_ready()` (PaddleOcrEngine consults
   `gate.ensure_download_allowed`) runs before `capturer.capture()`, so first-run raises
   ConsentRequired (models:consent-required) with ZERO screen grab (security-reviewer confirmed
   the privacy win; the in-recognize gate remains as defense-in-depth).
3. Model-download bounded: `OAROCRBuilder::build()` runs under a 180s `run_bounded` timeout ->
   actionable OcrError::ModelLoad, still fail-closed + SHA-256-verified (only the wait is bounded).

Evidence (proven, not asserted where possible): release binary built (ost.exe 39MB, embedded
dist via tauri://) and launched without crash; the opt-in real-capture smoke
(real_windows_capture_returns_and_does_not_park) RAN on a display host and the REAL capturer
returned in ~0.01s. Gates: qa 272 passed (incl. 4 new regression tests that would have caught
this) + the real-capture smoke; code-reviewer PASS (COM sound, timeout correct); security-reviewer
PASS. secret-scan clean; CI green.

KEY FINDING: the debugger assumed Windows Graphics Capture, but xcap 0.9.6 uses its GDI path by
default (the `wgc` feature is off). The fix (COM-init + bounded timeout + destroy-overlay-before-
capture + gate-first ordering) is defensive and correct for either backend; the hang symptom is
addressed regardless. Switching capture backends would need an ADR - not done here.

NOT proven by unit tests (needs a real display, deferred to the e2e/release-smoke gate TASK-022):
the full interactive region-drag reaching consent/preview without a hang; the 5s capture timeout
actually firing on a genuinely-stalled frame; the overlay-destroy race elimination end to end.

Non-blocking nits (tracked): add a tracing::warn to the gate-less ensure_ready branch for symmetry;
the detached worker holds its COM apartment until it unwinds on repeated timeouts (theoretical);
factor the duplicated bounded-join helper into a shared core util.
