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
- [x] `AudioSource` trait + Windows WASAPI loopback impl (`wasapi` 0.23.0).
- [x] VAD to gate speech vs silence; silence produces no chunk (AC-01.9).
- [x] Chunking suitable for the STT budget; heavy work on a dedicated thread (AC-05.3).
- [x] Stop path releases capture within <= 1s (AC-01.10).
- [x] Synthetic fixture-audio tests; no real user audio; audio never written to disk (AC-01.6).

## Test scenarios / acceptance
- [x] AC-01.6: raw audio never on disk, never in a network payload.
      (`session::tests::session_keeps_audio_in_memory_and_writes_no_file` watches a temp dir
      across a full session; `CaptureError` never carries samples; no `std::fs` write path.)
- [x] AC-01.9: silence yields no caption and no LLM call.
      (`vad::tests::pure_silence_never_activates`, `chunk::tests::pure_silence_emits_no_chunk`,
      `session::tests::silence_session_emits_nothing` - silence produces zero chunks.)
- [x] AC-01.10: stop halts capture <= 1s and frees session resources.
      (`session::tests::stop_halts_capture_within_one_second`; bounded `read` + Drop stop.)
- [x] AC-05.3: capture runs off the UI thread.
      (Dedicated `std::thread` "ost-audio-capture"; chunks stream via `tokio::sync::mpsc`.)

## Orchestration notes
- Phase 2 opener; feeds TASK-014 STT.

## Session log (AI session log)

| Date | Who | What was done | Result |
|------|-----|---------------|--------|
| 2026-07-10 | orchestrator | Task created and registered in master-plan (Phase B decomposition) | Planned |
| 2026-07-10 | audio-pipeline-dev | Flip Planned -> Active; start TDD on AudioSource trait + VAD + chunking + session | Active |
| 2026-07-10 | audio-pipeline-dev | Implemented audio/{source,vad,chunk,session,wasapi}; wasapi=0.23.0 pinned (win-gated); minimal lib.rs/Cargo.toml adds | fmt clean, clippy -D warnings clean, cargo test 143 passed/0 failed/1 ignored (audio 19) |
| 2026-07-10 | audio-pipeline-dev | Recovery: prior session had already committed (1d392ca) + pushed; verified ACs met, rebased feat/audio-capture onto origin/main (de69810, TASK-010 providers). lib.rs/Cargo.toml/Cargo.lock applied cleanly as unions (providers scaffolding pre-existed base; TASK-010 added only files under providers/, no textual overlap with audio/). Re-verified on rebased tree. | fmt --check clean; clippy --all-targets -D warnings clean; cargo test 196 passed/0 failed/1 ignored (audio unit + session incl. no-disk guard). Tip bef5fa8. |

## Result
<Fill when moving to Done; link the PR/commit. Then move the file to docs/tasks/done/.>
