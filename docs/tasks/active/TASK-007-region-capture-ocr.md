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
- [x] OCR-stage latency p95 <= 700ms on representative region crops (~400x100 up to ~1200x800) on a consumer CPU. **MET** - aggregate warm p95 = 277ms, max 291ms (release build).
- [x] JA-vertical (縦書き / tategaki) recognition: character accuracy measured on synthetic vertical-text crops against a stated minimum character-accuracy bar. **MET** - bar >= 0.70; measured 1.000 (space-insensitive). Det returns one box per stacked glyph, all glyphs recognized correctly in reading order.
- [x] Low-DPI EN + JA subtitle recognition: character accuracy measured on synthetic low-DPI game/UI subtitle screenshots against a stated minimum character-accuracy bar. **MET** - EN bar >= 0.90 measured 1.000; JA bar >= 0.75 measured 1.000.
- [x] Per-line confidence availability confirmed (`PerLine` scores from oar-ocr) and its distribution recorded for OI-07 threshold calibration. **CONFIRMED** - `TextRegion.confidence: Option<f32>` per line; distribution on clean fixtures min=0.967 median=1.000 mean=0.993 (all in [0.95,1.00]). Caveat: clean synthetic fixtures do not exercise the low-confidence tail; OI-07 calibration needs degraded/real inputs.
- [x] Vietnamese fixtures included in the measurement set (coverage check, secondary). **INCLUDED** - vi recognized (coverage met) but char accuracy 0.727-0.741 (space-insensitive): the latin PP-OCRv5 mobile rec model systematically drops dense tone-mark stacks (ả/ạ/ử/ụ/ầ/ế). Below the 0.85 quality bar I set. See escalation below - owner call.
- [x] Idle/resident footprint probe: RAM during active OCR and 60s post-session vs NFR-PERF-03 (< 100MB idle); ORT session loaded lazily, never at app start (NFR-REL-02). **MET** - lazy load confirmed (RAM 10.4MB after `new()`, `is_loaded()==false`); one active session ~104MB; after dropping the engine 39.5MB and unchanged at 60s idle. Integration must DROP the session on idle to hold <100MB.
- [x] Criterion benchmark wired so latency regressions beyond budget fail CI/review (ADR-004 R1; NFR-PERF-05 pattern). **DONE** - `benches/ocr_stage.rs` (run `cargo bench --features ocr-spike`): 66.6 / 113 / 170 / 280 ms across the four crop sizes.
- [x] Spike results recorded in this file. On PASS the orchestrator opens the pipeline-integration gate. On FAIL, escalate per ADR-004 R2 ladder - do NOT silently promote Windows.Media.Ocr as default (it sacrifices Vietnamese coverage and needs an owner-signed AC-02.6 amendment; see known-issues). **DONE** - see "R1 spike results" below. Latency + EN/JA (primary) + confidence + RAM/lazy all PASS; the sole open item is Vietnamese quality (secondary) - escalated to orchestrator/owner, NOT silently resolved. Integration gate stays CLOSED pending that call.

## R1 spike results (2026-07-09, screen-translate-dev, this dev CPU, release build)

Engine: PaddleOCR PP-OCRv5 mobile (det `pp-ocrv5_mobile_det.onnx` + rec `pp-ocrv5_mobile_rec.onnx`/`latin_..`/`korean_..`) via oar-ocr 0.8.0 + ort 2.0.0-rc.12. Fixtures synthetic (invented strings rendered from system fonts), no user content. Models auto-downloaded from ModelScope into the oar-ocr cache (NOT the repo, NOT committed).

Latency (warm, 25 samples/size, release):
| crop | min | median | p95 | max |
|------|-----|--------|-----|-----|
| 400x100 | 41.3 | 44.1 | 51.0 | 53.0 |
| 800x200 | 70.0 | 73.1 | 110.5 | 113.1 |
| 1200x300 | 134.5 | 141.4 | 147.9 | 148.7 |
| 1200x800 | 257.2 | 271.8 | 287.5 | 290.5 |
| AGGREGATE (n=100) | 41.3 | 123.8 | **277.2** | 290.5 |
Cold first call (models cached, includes ORT session build): 380ms. Very-first-ever run (incl. ~40MB model download): 10778ms (one-time, whisper-style first-run). Budget p95 <= 700ms: **PASS** with ~2.5x margin.

Character accuracy (space-insensitive = fair OCR-quality metric):
| fixture | acc | bar | verdict |
|---------|-----|-----|---------|
| en-general 400/800/1200 | 1.000 | 0.90 | PASS |
| en-subtitle low-DPI | 1.000 | 0.90 | PASS |
| ja-general | 1.000 | 0.80 | PASS |
| ja-subtitle low-DPI | 1.000 | 0.75 | PASS |
| ja-vertical (縦書き) | 1.000 | 0.70 | PASS |
| ko-general | 1.000 | - | PASS |
| zh-general | 1.000 | - | PASS |
| vi-general | 0.741 | 0.85 | BELOW BAR |
| vi-subtitle low-DPI | 0.727 | 0.85 | BELOW BAR |

Confidence (`OcrConfidence::PerLine`): available per line; on clean fixtures min=0.967 p25=0.994 median=1.000 mean=0.993 p95=1.000 (all 25 scores in [0.95,1.00)). OI-07 note: clean fixtures skew high; the low tail needs degraded inputs to calibrate a threshold.

RAM (own working set): start 10.4MB; after `PaddleOcrEngine::new()` 10.4MB (session NOT built - lazy load proven, `is_loaded()==false`); one session active 104.1MB; three sessions + all fixtures resident (worst case, not a real scenario) 467MB; after dropping engines 39.5MB; 60s idle post-drop 39.5MB. NFR-PERF-03 idle <100MB: PASS in the true-idle (session-not-loaded) and session-dropped states. **Integration requirement: drop the ORT session when a region session ends** (a resident session is ~94MB over baseline).

DECISION: latency PASS, EN/JA (highest-weight axis) + JA-vertical + low-DPI + ko/zh + confidence + RAM/lazy-load all PASS. Single open item = Vietnamese recognition quality (0.73-0.74, secondary axis; coverage is met, quality below my 0.85 bar). Per ADR-004 R2 and the owner's Vietnamese-required stance this is an owner/orchestrator call, not mine. Integration gate remains CLOSED. R2-ladder-adjacent mitigations to weigh (do NOT touch WMO - it has no vi and no confidence): upscale the crop before rec / try PP-OCRv5 latin at higher DPI, evaluate the dedicated `en`/`latin` server rec, or accept 0.74 vi as "covered" for MVP with the low-confidence flag surfacing the tone-mark misses.

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
| 2026-07-09 | screen-translate-dev | Ran R1 OCR spike (step one only): added `OcrEngine` trait + `PaddleOcrEngine` (oar-ocr 0.8.0 + ort 2.0.0-rc.12, lazy ORT session), synthetic fixture generator (feature `ocr-spike`), harness `tests/ocr_spike.rs`, criterion `benches/ocr_stage.rs`. Measured latency p95=277ms (<=700 PASS), EN/JA/ja-vertical/low-DPI/ko/zh accuracy=1.000, per-line `PerLine` confidence confirmed, lazy load + idle RAM PASS. Vietnamese covered but 0.73-0.74 (tone-mark drops) below the 0.85 bar. cargo fmt/clippy -D warnings clean, unit tests green. No IPC/pipeline wired (gated) | Spike PASS on all mandatory criteria; Vietnamese quality escalated to orchestrator/owner; integration gate stays closed |

## Result
<Fill when moving to Done; link the PR/commit. Then move the file to docs/tasks/done/.>
