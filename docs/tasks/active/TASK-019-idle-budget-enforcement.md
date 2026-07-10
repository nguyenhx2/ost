---
title: "TASK-019: Idle-budget enforcement + session-drop discipline"
status: Active
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

## Result
<Fill when moving to Done; link the PR/commit. Then move the file to docs/tasks/done/.>
