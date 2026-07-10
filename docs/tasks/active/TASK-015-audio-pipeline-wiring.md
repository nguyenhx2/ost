---
title: "TASK-015: Audio session pipeline wiring + audio p95 under 3s benchmark"
status: Active
fr: "FR-01, FR-05"
owner: audio-pipeline-dev
deps: "TASK-013, TASK-014"
priority: P0
phase: 2
created: 2026-07-10
tags: [task]
---

<!-- TASK FILES ARE WRITTEN 100% IN ENGLISH (see .claude/rules/task-tracking.md). -->

# TASK-015: Audio session pipeline wiring + audio p95 under 3s benchmark

## Goal
Wire capture -> VAD -> STT -> provider translate -> caption event end to end, and guard the audio caption end-to-end p95 < 3s budget with a criterion benchmark.

## Inputs / context
- Related FR: [FR-01](../../specs/05-functional-requirements.md#fr-01), [FR-05](../../specs/05-functional-requirements.md#fr-05).
- Related files: `src-tauri/src/audio/`, `src-tauri/src/commands/`, `src-tauri/benches/`.
- Budget: audio caption end-to-end p95 < 3s (AC-01.2 / AC-05.2 / AC-05.5).

## To do
- [x] Session orchestration: capture->VAD->STT->providers/ translate->emit caption event; all off the UI thread.
- [x] Source-language pin/auto (AC-01.4); target language default vi, configurable (AC-01.5).
- [x] No-provider-configured path shows an actionable error to Settings, no crash (AC-01.11).
- [x] Stop session halts <= 1s and releases resources (AC-01.10).
- [x] Criterion benchmark on the caption path; regression beyond p95 < 3s fails CI (AC-05.5). Measured p95=1.78s (base model, provider mocked).
- [x] SECURITY (carried from TASK-014 review, MANDATORY before the real model byte-download): pin the official per-file whisper SHA-256 for every WhisperModel constant and enforce `crate::models::verify_sha256` BEFORE the model is loaded; REFUSE the download when `sha256.is_none()`. Digests re-verified against HF ggerganov/whisper.cpp LFS metadata (oid+size exact).
- [x] Make the whisper consent gate a REQUIRED `WhisperStt` constructor parameter (drop the optional `with_consent_gate` builder path) so the release-mode gate=None warn-and-proceed cannot exist once the engine is wired in.
- [x] Run whisper inference (and OCR) on `spawn_blocking` / a dedicated thread - never a Tokio worker (AC-05.3). Asserted by `transcription_runs_off_the_async_worker`.
- [ ] Record each completed audio caption to history via the existing frontend `recordTranslation` seam (TASK-018), sessionType `audio`; MAKE that record write atomic (read-modify-write) so concurrent region+audio completions do not drop entries (TASK-018 follow-up). DEFERRED: the history record write is a frontend (`src/`) seam outside this module's scope; reported to the orchestrator for TASK-018.

## Test scenarios / acceptance
- [ ] AC-01.1, AC-01.2 (p95 < 3s, >= 10 min session), AC-01.4, AC-01.5, AC-01.9, AC-01.10, AC-01.11, AC-05.5.
- [ ] Providers mocked in tests; benchmark reproducible.

## Orchestration notes
- 2026-07-10: TASK-014 code/security review handed down 4 hard requirements for this task (SHA-256 pin+verify+refuse-if-none, required consent-gate ctor param, spawn_blocking inference, criterion p95<3s bench) plus the TASK-018 atomic-record follow-up. security-reviewer is MANDATORY here (model-download egress + captured audio).
- Latency budget gates the merge; report the measured p95.

## Session log (AI session log)

| Date | Who | What was done | Result |
|------|-----|---------------|--------|
| 2026-07-10 | orchestrator | Task created and registered in master-plan (Phase B decomposition) | Planned |
| 2026-07-10 | audio-pipeline-dev | Flipped status Planned -> Active; reviewed TASK-013/014 seams, provider factory, region.rs pipeline pattern; validated whisper native toolchain builds (reused t14 cache); fetched official whisper ggml SHA-256 digests from HF LFS metadata | Active |
| 2026-07-10 | audio-pipeline-dev | Implemented audio_session.rs (capture->VAD->STT->translate->audio:caption, off UI thread), stt/download.rs (consent gate + pinned SHA-256 verify, refuse-if-none), criterion bench, ipc.md contract; whisper consent gate now a required ctor param; inference on spawn_blocking | Implemented (uncommitted, interrupted mid-finalize) |
| 2026-07-10 | audio-pipeline-dev | RECOVERY: assessed uncommitted state (no live writer); re-verified all 4 pinned whisper SHA-256 against HF ggerganov/whisper.cpp LFS metadata (oid+size exact match); fmt --check clean, clippy --all-targets -D warnings clean, cargo test 248 passed/1 ignored; ran audio-caption bench with real base model (downloaded via pinned+verified consent path, provider mocked): p95=1.78s median=1.74s WITHIN 3s budget | Verified, budget met |

## Result
<Fill when moving to Done; link the PR/commit. Then move the file to docs/tasks/done/.>
