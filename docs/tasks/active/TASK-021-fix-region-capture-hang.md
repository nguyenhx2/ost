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

## Result
<Fill when moving to Done; link the PR/commit. Then move the file to docs/tasks/done/.>
