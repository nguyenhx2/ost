---
title: "TASK-007: Region capture + OCR pipeline (Rust side)"
status: Active
fr: "FR-02"
owner: screen-translate-dev
deps: "TASK-002, TASK-005"
priority: P0
phase: 1
created: 2026-07-09
tags: [task]
---

# TASK-007: Region capture + OCR pipeline (Rust side)

## Goal
Given region coordinates over IPC, the Rust core captures the region, runs OCR, and emits recognized text (then translated text via the provider layer) as Tauri events. Local PaddleOCR PP-OCRv5 (ADR-004) is the default and the only OCR engine in scope for this task; cloud backends are out of scope here.

## Inputs / context
- FR-02 spec; ADR-004 (Accepted 2026-07-09): local default PaddleOCR PP-OCRv5 via oar-ocr 0.8.0 + ort 2.0.0-rc.12 behind the `OcrEngine` trait; Windows.Media.Ocr is an R2 fallback only; cloud backends are opt-in, owner-gated, and NOT part of this task.
- Traits `ScreenCapturer`, `OcrEngine` (NFR-SCA-01).
- Budget: region translate p95 < 2s from selection (NFR-PERF-02); OCR-stage working budget <= 700ms p95 (ADR-004 R1).
- Confidence is enum-tagged: `PerLine(scores)` vs `Unavailable{reason}` (AC-02.6/OI-07); local PaddleOCR provides `PerLine`.

## Gating: STEP ONE is the OCR latency criterion spike (ADR-004 R1) - MANDATORY
Pipeline integration is BLOCKED until the spike passes. Do NOT wire capture -> OCR -> translate or change IPC contracts before the spike gate is green and the orchestrator confirms it.

### Spike scope (step one)
Measure PP-OCRv5 mobile (det + rec) via oar-ocr on representative synthetic region crops on a consumer CPU. Fixtures are synthetic/self-rendered only (no real user content); EN + JA are primary, Vietnamese + ko + zh are secondary and KEPT in the set.

### Spike acceptance criteria (all must be produced/met before the gate opens)
- [ ] OCR-stage latency p95 <= 700ms on representative region crops (~400x100 up to ~1200x800) on a consumer CPU.
- [ ] JA-vertical (縦書き / tategaki) recognition: character accuracy measured on synthetic vertical-text crops against a stated minimum character-accuracy bar.
- [ ] Low-DPI EN + JA subtitle recognition: character accuracy measured on synthetic low-DPI game/UI subtitle screenshots against a stated minimum character-accuracy bar.
- [ ] Per-line confidence availability confirmed (`PerLine` scores from oar-ocr) and its distribution recorded for OI-07 threshold calibration.
- [ ] Vietnamese fixtures included in the measurement set (coverage check, secondary).
- [ ] Idle/resident footprint probe: RAM during active OCR and 60s post-session vs NFR-PERF-03 (< 100MB idle); ORT session loaded lazily, never at app start (NFR-REL-02).
- [ ] Criterion benchmark wired so latency regressions beyond budget fail CI/review (ADR-004 R1; NFR-PERF-05 pattern).
- [ ] Spike results recorded in this file. On PASS the orchestrator opens the pipeline-integration gate. On FAIL, escalate per ADR-004 R2 ladder - do NOT silently promote Windows.Media.Ocr as default (it sacrifices Vietnamese coverage and needs an owner-signed AC-02.6 amendment; see known-issues).

## To do (pipeline - GATED behind the spike passing)
- [ ] `capture/`: Windows region capture behind `ScreenCapturer` + fixture-image tests.
- [ ] `ocr/`: PaddleOCR PP-OCRv5 via oar-ocr behind `OcrEngine`; confidence surfaced per line as `PerLine` (AC-02.6); `Unavailable{reason}` variant defined for future backends.
- [ ] Pipeline wiring: capture -> OCR -> emit `ocr-result` event -> provider translate -> emit `translation-result` event (incremental preview contract).
- [ ] `docs/architecture/api-contracts/ipc.md` updated in the same PR.
- [ ] Local-only: no cloud OCR dependency or code path in this task (ADR-004 sequencing).

## Test scenarios / acceptance
- [ ] Spike gate above passes FIRST (latency, JA-vertical, low-DPI EN+JA, confidence, Vietnamese fixture, idle footprint, CI benchmark).
- [ ] Synthetic rendered-text images OCR correctly (Latin + Vietnamese + JA fixtures).
- [ ] Low-confidence lines flagged in the event payload (BR-05 / AC-02.6).
- [ ] Screenshot never written to disk and never leaves the machine on the local path (AC-02.5 / NFR-SEC-03 audit).
- [ ] Criterion benchmark on the capture -> OCR path exists and meets budget locally.

## Orchestration notes
- 2026-07-09: unblocked by ADR-004 acceptance (owner sign-off). Scoped LOCAL-ONLY: PaddleOCR PP-OCRv5 default; cloud backends are separate, owner-gated, sequenced AFTER the local engine is proven, each with a security-reviewer pass on the image-egress path.
- The R1 latency spike is step one and an explicit gate; pipeline integration must not start until it passes and the orchestrator confirms.

## Session log (AI session log)

| Date | Who | What was done | Result |
|------|-----|---------------|--------|
| 2026-07-09 | orchestrator | Task created and registered in master-plan (bootstrap seed) | Planned |
| 2026-07-09 | orchestrator | Unblocked on ADR-004 acceptance; status Planned -> Active; task refreshed with the R1 OCR latency spike as step-one gate (p95 <= 700ms, JA-vertical, low-DPI EN+JA, confidence availability, Vietnamese fixtures, idle probe, CI benchmark); pipeline integration gated behind the spike | Active |

## Result
<Fill when moving to Done; link the PR/commit. Then move the file to docs/tasks/done/.>
