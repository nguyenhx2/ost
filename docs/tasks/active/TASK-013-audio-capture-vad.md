---
title: "TASK-013: System-audio capture: WASAPI loopback + VAD + chunking"
status: Active
fr: "FR-01"
owner: audio-pipeline-dev
deps: "TASK-002"
priority: P0
phase: 2
created: 2026-07-10
tags: [task]
---

<!-- TASK FILES ARE WRITTEN 100% IN ENGLISH (see .claude/rules/task-tracking.md). -->

# TASK-013: System-audio capture: WASAPI loopback + VAD + chunking

## Goal
Capture system audio via WASAPI loopback behind an `AudioSource` trait, detect voice activity, and chunk speech for STT - all off the UI thread, never to disk.

## Inputs / context
- Related FR: [FR-01](../../specs/05-functional-requirements.md#fr-01).
- Related files: `src-tauri/src/audio/`.
- Trait `AudioSource` (NFR-SCA-01) so the macOS/Linux ports swap impls later.

## To do
- [ ] `AudioSource` trait + Windows WASAPI loopback impl (`cpal`/`wasapi`).
- [ ] VAD to gate speech vs silence; silence produces no chunk (AC-01.9).
- [ ] Chunking suitable for the STT budget; heavy work on a dedicated async task/thread (AC-05.3).
- [ ] Stop path releases capture within <= 1s (AC-01.10).
- [ ] Synthetic fixture-audio tests; no real user audio; audio never written to disk (AC-01.6).

## Test scenarios / acceptance
- [ ] AC-01.6: raw audio never on disk, never in a network payload.
- [ ] AC-01.9: silence yields no caption and no LLM call.
- [ ] AC-01.10: stop halts capture <= 1s and frees session resources.
- [ ] AC-05.3: capture runs off the UI thread.

## Orchestration notes
- Phase 2 opener; feeds TASK-014 STT.

## Session log (AI session log)

| Date | Who | What was done | Result |
|------|-----|---------------|--------|
| 2026-07-10 | orchestrator | Task created and registered in master-plan (Phase B decomposition) | Planned |
| 2026-07-10 | audio-pipeline-dev | Flip Planned -> Active; start TDD on AudioSource trait + VAD + chunking + session | Active |

## Result
<Fill when moving to Done; link the PR/commit. Then move the file to docs/tasks/done/.>
