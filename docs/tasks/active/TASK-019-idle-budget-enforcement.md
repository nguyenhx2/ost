---
title: "TASK-019: Idle-budget enforcement + session-drop discipline"
status: Planned
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
- [ ] Drop the ORT and whisper sessions when their pipeline ends; ensure at most one heavy session resident at a time.
- [ ] Measure idle RAM/CPU over a 5-min window (AC-05.1); return-to-idle within 60s of stop (AC-05.4).
- [ ] Guard with a test/benchmark; regression beyond budget fails review (BR-04).

## Test scenarios / acceptance
- [ ] AC-05.1 idle RAM < 100MB, CPU < 1%; AC-05.3 heavy work off UI thread; AC-05.4 return-to-idle <= 60s.
- [ ] Report the measured idle RAM and CPU numbers.

## Orchestration notes
- Cross-cutting; touches both pipeline lifecycles. Report real numbers - the budget gates the merge.

## Session log (AI session log)

| Date | Who | What was done | Result |
|------|-----|---------------|--------|
| 2026-07-10 | orchestrator | Task created and registered in master-plan (Phase B decomposition) | Planned |

## Result
<Fill when moving to Done; link the PR/commit. Then move the file to docs/tasks/done/.>
