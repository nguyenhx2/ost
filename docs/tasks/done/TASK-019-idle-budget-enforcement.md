---
title: "TASK-019: Idle-budget enforcement + session-drop discipline"
status: Done
fr: "FR-05"
owner: audio-pipeline-dev
deps: "TASK-007, TASK-015"
priority: P0
phase: 3
created: 2026-07-10
tags: [task]
---

<!-- TASK FILES ARE WRITTEN 100% IN ENGLISH (see .claude/rules/task-tracking.md). -->

# TASK-019: Idle-budget enforcement + session-drop discipline

## Goal
Enforce the idle resource budget (RAM < 100MB, CPU < 1%) and the one-heavy-session-at-a-time drop discipline so resources return to idle within 60s of a session ending.

## Inputs / context
- Related FR: [FR-05](../../specs/05-functional-requirements.md#fr-05); BR-04; NFR-PERF-03/REL-02.
- Related files: `src-tauri/src/ocr/` (ORT session), `src-tauri/src/stt/` (whisper session), the session lifecycle.
- A resident ORT session is ~94MB over baseline (the TASK-007 RAM probe); whisper is similarly heavy.

## To do
- [x] Drop the ORT and whisper sessions when their pipeline ends; ensure at most one heavy session resident at a time (`core::HeavySessionCoordinator`, wired into both pipelines).
- [x] Measure idle RAM/CPU (AC-05.1); return-to-idle on stop (AC-05.4) - coordinator `end()` drops the session's model, verified by unit + wiring tests and the `idle_probe` example.
- [x] Guard with a test; a resident-session leak (engine still loaded at idle) fails the wiring test (BR-04).

## Test scenarios / acceptance
- [x] AC-05.1 idle RAM < 100MB, CPU < 1% (measured 9.2 MiB / 0.000% Rust-core, 30s window); AC-05.3 heavy work off UI thread (pre-existing `spawn_blocking` guard test still green); AC-05.4 return-to-idle (models unloaded on stop, coordinator marker cleared).
- [x] Reported measured idle RAM and CPU numbers (see session log).

## Orchestration notes
- Cross-cutting; touches both pipeline lifecycles. Report real numbers - the budget gates the merge.

## Session log (AI session log)

| Date | Who | What was done | Result |
|------|-----|---------------|--------|
| 2026-07-10 | orchestrator | Task created and registered in master-plan (Phase B decomposition) | Planned |
| 2026-07-10 | audio-pipeline-dev | Flip status Planned -> Active; begin idle-budget + one-session coordinator | Active |
| 2026-07-10 | audio-pipeline-dev | Add `core::HeavySessionCoordinator` (one-heavy-session-at-a-time, BR-04) + `core::resource` process RAM/CPU probe (dependency-free Win32 FFI); wire both pipelines (region begin/end OCR, audio begin/end STT) through the coordinator | Done |
| 2026-07-10 | audio-pipeline-dev | Measured idle via `examples/idle_probe` (release, 30s window, true idle no model): idle RAM 9.2 MiB, idle CPU 0.000% - both under budget (< 100MB / < 1%). Rust-core process only (excludes system WebView). Resident-session delta: ORT OCR ~94MB (TASK-007 probe, not re-measured - needs gated model download) | Done |
| 2026-07-10 | audio-pipeline-dev | cargo fmt --check clean; clippy --all-targets -j 2 -D warnings clean; cargo test 263 passed / 1 ignored (stt-live). No new dependency (raw FFI) - no tool-changelog entry | Done |
| 2026-07-10 | qa-test | Verified: cargo test 263 passed / 0 failed / 1 ignored, clippy -D warnings + fmt clean. Independently RAN idle_probe (30s): idle RAM 8.5 MiB, CPU 0.000% (both within <100MB/<1% budget); active()==None after a start/stop cycle (return-to-idle). One-session-at-a-time covered both directions. No test added. | Green (RAM 8.5MiB CPU 0%) |
| 2026-07-10 | code-reviewer | PASS. HeavySessionCoordinator one-at-a-time correct; hooks run after lock release (no re-entrancy deadlock); no poisoned-lock wedge; no unwrap outside tests. Win32 FFI (K32GetProcessMemoryInfo/GetProcessTimes) sound + reads only process RAM/CPU (no captured content/keys). Reuses existing unload() APIs - no ocr/stt internals touched. master-plan only TASK-019 row; TASK-016 non-revert confirmed. Nits non-blocking. | PASS |
| 2026-07-10 | orchestrator | Rebased onto main (auto-merged, fixed the stale TASK-016 row - verified single-row diff). Merged PR #32 (merge commit a3ed6d6); CI GREEN; secret-scan clean. Closed: Done in frontmatter + board, moved to done/. | Done |

## Result
Idle-budget enforcement + one-heavy-session-at-a-time drop discipline is on `main` (PR #32,
merge commit a3ed6d6). A `HeavySessionCoordinator` (src-tauri/src/core/session.rs) holds a
per-kind unload hook wrapping each pipeline's existing `unload()`: `begin(kind)` drops every
OTHER resident heavy set, `end(kind)` drops its own. Region OCR wires begin(Ocr)/end(Ocr) on
preview open/close; audio wires begin(Stt)/unload+end(Stt) on session start/stop. So at most
one heavy model session (ORT OCR ~94MB, or the heavier whisper context) is resident at a time.
A dependency-free Win32 resource probe (core/resource.rs, K32GetProcessMemoryInfo +
GetProcessTimes) and a runnable `examples/idle_probe.rs` measure real process RAM/CPU.

MEASURED (AC-05.1/AC-05.4, two independent runs): idle RAM 8.5 MiB (qa) / 9.2 MiB (dev) - far
under the 100MB budget; idle CPU 0.000% - under the 1% budget; active session == None after a
start/stop cycle (return-to-idle). Caveat: this is the Rust-core process footprint; the shipped
Tauri app also hosts the system WebView (outside this crate), covered by e2e budget checks.
Resident-session delta not re-measured (needs a gated model download); the ORT ~94MB figure
from TASK-007 stands. No budget miss.

Gates: qa 263 passed + real idle numbers; code-reviewer PASS (coordinator correct, FFI sound,
no content leak); no security-reviewer required (no key/egress/captured-content path);
secret-scan clean; CI green.
