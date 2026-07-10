---
title: "TASK-015: Audio session pipeline wiring + audio p95 under 3s benchmark"
status: Planned
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
- [ ] Session orchestration: capture->VAD->STT->providers/ translate->emit caption event; all off the UI thread.
- [ ] Source-language pin/auto (AC-01.4); target language default vi, configurable (AC-01.5).
- [ ] No-provider-configured path shows an actionable error to Settings, no crash (AC-01.11).
- [ ] Stop session halts <= 1s and releases resources (AC-01.10).
- [ ] Criterion benchmark on the caption path; regression beyond p95 < 3s fails CI (AC-05.5).
- [ ] SECURITY (carried from TASK-014 review, MANDATORY before the real model byte-download): pin the official per-file whisper SHA-256 for every WhisperModel constant and enforce `crate::models::verify_sha256` BEFORE the model is loaded; REFUSE the download when `sha256.is_none()`. A None/unpinned hash at download time loads an unverified native ggml binary (supply-chain/code-exec surface).
- [ ] Make the whisper consent gate a REQUIRED `WhisperStt` constructor parameter (drop the optional `with_consent_gate` builder path) so the release-mode gate=None warn-and-proceed cannot exist once the engine is wired in.
- [ ] Run whisper inference (and OCR) on `spawn_blocking` / a dedicated thread - never a Tokio worker (AC-05.3).
- [ ] Record each completed audio caption to history via the existing frontend `recordTranslation` seam (TASK-018), sessionType `audio`; MAKE that record write atomic (read-modify-write) so concurrent region+audio completions do not drop entries (TASK-018 follow-up).

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

## Result
<Fill when moving to Done; link the PR/commit. Then move the file to docs/tasks/done/.>
