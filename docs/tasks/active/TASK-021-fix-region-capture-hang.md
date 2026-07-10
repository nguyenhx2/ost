---
title: "TASK-021: Fix region-capture WGC hang + first-run ordering + download timeout"
status: Active
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

## Result
<Fill when moving to Done; link the PR/commit. Then move the file to docs/tasks/done/.>
