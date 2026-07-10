---
title: "TASK-013: System-audio capture: WASAPI loopback + VAD + chunking"
status: Done
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
| 2026-07-10 | qa-test | Independently verified: cargo test 197 passed / 0 failed / 1 ignored (opt-in keychain smoke), clippy -D warnings + fmt clean. AC-01.6/01.9/01.10/05.3 covered; synthetic fixtures only. Added one AC-01.10 resource-free test (stop drops the source). | Green |
| 2026-07-10 | code-reviewer | PASS (after subject reword). AudioSource trait is the sole seam; capture on a dedicated std::thread (not a Tokio worker) with blocking_send; bounded stop via AtomicBool+Drop; thiserror errors carry no audio; no unwrap outside tests; wasapi pinned+win-gated+logged; master-plan only TASK-013 row. Nits non-blocking. | PASS |
| 2026-07-10 | security-reviewer | MANDATORY (captured audio + native dep). PASS: audio stays in in-memory f32 buffers - no fs/net path in audio/ (grep-confirmed), no samples in logs/errors, no IPC surface; no provider egress in this stage. wasapi=0.23.0 pinned, Windows-only, well-maintained safe WASAPI wrapper - acceptable first native audio dep; unsafe impl Send soundly justified. | PASS |
| 2026-07-10 | orchestrator | Reworded a 75-char commit subject to 60 (tree unchanged); merged PR #21 (merge commit 6269d90); CI green; secret-scan clean; board single-row verified. Closed: status Done in frontmatter + board, moved to done/. | Done |

## Result
System-audio capture is on `main` (PR #21, merge commit 6269d90). An `AudioSource` trait
with a Windows WASAPI loopback impl (`wasapi = 0.23.0`, Windows-only, pinned + logged in
tool-changelog), an energy VAD gating speech vs silence, and a speech chunker sized for the
STT budget. A `CaptureSession` runs the pull loop on a dedicated `std::thread`
(`ost-audio-capture`, off the UI thread) and streams `AudioChunk`s over a bounded
`tokio::mpsc` for TASK-014 to consume; stop halts capture within 1s via an atomic flag +
Drop that releases the endpoint.

Acceptance: AC-01.6 audio stays in RAM only, never on disk, never in a network payload
(no fs/net path in audio/ - grep-verified by security-reviewer; guard test
session_keeps_audio_in_memory_and_writes_no_file); AC-01.9 silence yields no chunk and no
downstream call (VAD/chunk/session tests); AC-01.10 stop <=1s + resources freed
(stop_halts_capture_within_one_second + stop_drops_the_source_releasing_resources);
AC-05.3 capture off the UI thread via the dedicated thread + mpsc.

Gates: qa-test 197 passed / 0 failed; code-reviewer PASS (after a commit-subject reword);
security-reviewer PASS (captured audio never reaches disk/log/network; wasapi dep accepted);
secret-scan clean; CI green.

No STT/translation/overlay here (TASK-014/015/016). Chunks are emitted through the internal
mpsc seam. Synthetic fixture audio only in tests - never real user audio.
