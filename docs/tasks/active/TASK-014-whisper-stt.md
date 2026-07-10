---
title: "TASK-014: Local STT: whisper.cpp via whisper-rs + first-run model download + hardware probe"
status: Planned
fr: "FR-01"
owner: audio-pipeline-dev
deps: "TASK-013, TASK-007"
priority: P0
phase: 2
created: 2026-07-10
tags: [task]
---

<!-- TASK FILES ARE WRITTEN 100% IN ENGLISH (see .claude/rules/task-tracking.md). -->

# TASK-014: Local STT: whisper.cpp via whisper-rs + first-run model download + hardware probe

## Goal
Transcribe audio chunks locally with whisper.cpp via `whisper-rs` behind a `SpeechToText` trait, with the first-run model download wired to the SHARED consent facility and a hardware-based model recommendation.

## Inputs / context
- Related FR: [FR-01](../../specs/05-functional-requirements.md#fr-01); ADR-002 (local whisper.cpp).
- Related files: `src-tauri/src/stt/`, reuse the `src-tauri/src/models/` consent facility from TASK-007.
- BR-08 (model downloaded only after user confirmation); hardware probe -> model recommendation.

## To do
- [ ] `SpeechToText` trait + `whisper-rs` local impl (ADR-002); lazy model load, unload on session end.
- [ ] First-run whisper model download wired to the SHARED models/ consent facility - do NOT build a second gate.
- [ ] Hardware probe (GPU/RAM) -> whisper model recommendation (BR-08); confirm before download (AC-01.8).
- [ ] Source-language auto-detect exposed; per-segment confidence for low-confidence flagging (AC-01.7).
- [ ] Fixture audio (synthetic/self-recorded) integration tests; models gitignored.

## Test scenarios / acceptance
- [ ] AC-01.3: auto language detection, detected language surfaced.
- [ ] AC-01.7: below-threshold segments carry a confidence flag.
- [ ] AC-01.8: hardware probe + model recommendation; download only after confirm (shared consent).
- [ ] AC-01.6: STT is local; audio never leaves the machine.

## Orchestration notes
- Reuses the TASK-007 consent facility - single gate. security-reviewer for the model-download path.

## Session log (AI session log)

| Date | Who | What was done | Result |
|------|-----|---------------|--------|
| 2026-07-10 | orchestrator | Task created and registered in master-plan (Phase B decomposition) | Planned |

## Result
<Fill when moving to Done; link the PR/commit. Then move the file to docs/tasks/done/.>
