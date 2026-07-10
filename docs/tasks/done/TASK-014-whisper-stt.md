---
title: "TASK-014: Local STT: whisper.cpp via whisper-rs + first-run model download + hardware probe"
status: Done
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
- [x] `SpeechToText` trait + `whisper-rs` local impl (ADR-002); lazy model load, unload on session end.
- [x] First-run whisper model download wired to the SHARED models/ consent facility - do NOT build a second gate.
- [x] Hardware probe (GPU/RAM) -> whisper model recommendation (BR-08); confirm before download (AC-01.8).
- [x] Source-language auto-detect exposed; per-segment confidence for low-confidence flagging (AC-01.7).
- [x] Fixture audio (synthetic/self-recorded) integration tests; models gitignored.

## Test scenarios / acceptance
- [x] AC-01.3: auto language detection, detected language surfaced (`DetectedLanguage`, whisper `full_lang_id_from_state`).
- [x] AC-01.7: below-threshold segments carry a confidence flag (`TranscriptSegment::is_low_confidence`, mean token prob).
- [x] AC-01.8: hardware probe + model recommendation; download only after confirm (shared consent gate, `whisper-ggml`).
- [x] AC-01.6: STT is local; audio in-memory only, resampled in RAM; only TEXT leaves the module.

## Orchestration notes
- Reuses the TASK-007 consent facility - single gate. security-reviewer for the model-download path.

## Session log (AI session log)

| Date | Who | What was done | Result |
|------|-----|---------------|--------|
| 2026-07-10 | orchestrator | Task created and registered in master-plan (Phase B decomposition) | Planned |
| 2026-07-10 | audio-pipeline-dev | Toolchain unblocked (PR #25); reset branch to main, flip status Active | Active |
| 2026-07-10 | audio-pipeline-dev | Added whisper-rs =0.14.4; SpeechToText trait + WhisperStt (lazy load/unload), model registry + shared consent descriptor (whisper-ggml, HF), HW probe -> model rec (BR-08), 16k resample, per-seg confidence, auto/pinned lang. Real build via vcvars64+Ninja+LLVM19 on D:/t14 (C: full). fmt/clippy(-D warnings)/test all green: 228 passed (31 stt), stt-live gated test compiles | Active |
| 2026-07-10 | qa-test | Verified: whisper-rs genuinely compiled+linked; cargo test 228 passed / 0 failed / 1 ignored (31 stt), clippy -D warnings + fmt clean; stt-live real-model test gated off (no download). recommend_model tiers, fail-closed consent, per-seg confidence, resample all covered. No test added. | Green |
| 2026-07-10 | code-reviewer | PASS. SpeechToText trait abstraction; lazy-load + unload; shared ModelGate (no second gate, whisper-ggml); no blocking-in-async (inference sync, spawn_blocking mandated by doc - wire in TASK-015); models gitignored; whisper-rs =0.14.4 pinned. Follow-ups -> TASK-015. | PASS |
| 2026-07-10 | security-reviewer | MANDATORY (model-download consent + captured audio). PASS. No model load/download without recorded consent (gate check before load, mirrors ocr::paddle; fail-closed test proves ConsentRequired + is_loaded()==false + no network/file). Captured audio never reaches disk/log/network (resample in-memory; no fs/net in stt/). sha256=None acceptable now (no reachable download path). | PASS |
| 2026-07-10 | orchestrator | Merged PR #26 (merge commit 84d1417); CI GREEN (whisper.cpp compiled on the runner 21m). Closed: status Done in frontmatter + board, moved to done/. TASK-015 follow-ups recorded. | Done |

## Result
Local STT is on `main` (PR #26, merge commit 84d1417, ADR-002). whisper.cpp via `whisper-rs`
= 0.14.4 behind a `SpeechToText` trait (engine.rs), `WhisperStt` impl (whisper.rs) with lazy
whisper-context load + `unload()`/drop on session end, 16 kHz resample, per-segment confidence,
and auto/pinned source-language detection. A whisper model descriptor (`whisper-ggml`,
HuggingFace) is registered in the SHARED `ModelGate` (no second consent gate) - the download is
fail-closed (proven: transcribe without consent returns ConsentRequired and never loads/fetches).
A dependency-free `GlobalMemoryStatusEx` hardware probe drives `recommend_model` (BR-08/AC-01.8:
RAM tiers -> Tiny/Base/Small, GPU+16GiB -> Medium dormant).

The native toolchain blocker (whisper-rs-sys needs libclang + CMake) was resolved by devops
(PR #25): LLVM/libclang PINNED to 19.1.7 (bindgen 0.71 miscompiles with libclang >= 21), CMake
4.3.4, Ninja on the dev host; CI installs them too. whisper.cpp compiled green both locally
(13m) and in CI (21m).

Acceptance: AC-01.3 detected language surfaced; AC-01.7 per-segment confidence; AC-01.8/BR-08
hardware probe -> model recommendation, consent-gated download. Gates: qa 228 passed;
code-reviewer PASS; security-reviewer PASS; secret-scan clean; CI green.

REQUIRED for TASK-015 (both reviewers, hard requirements before the real model byte-download):
- Pin the official per-file whisper SHA-256 for every WhisperModel constant and enforce
  `crate::models::verify_sha256` BEFORE the model is loaded; REFUSE download when sha256.is_none()
  (a None hash at download time loads an unverified native ggml binary - supply-chain surface).
- Make the consent gate a REQUIRED WhisperStt constructor parameter (not the optional
  with_consent_gate builder) so the release-mode gate=None warn-and-proceed path cannot exist
  once the engine is wired into the pipeline.
- Wire whisper inference on spawn_blocking / a dedicated thread (not a Tokio worker).
- Add the criterion audio caption end-to-end p95 < 3s benchmark (AC-01.2/AC-05.5).
No STT/translate/overlay wiring here - that is TASK-015/016.
