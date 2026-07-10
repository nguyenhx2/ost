---
title: "TASK-007: Region capture + OCR pipeline (Rust side)"
status: Done
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

## R2 spike results (2026-07-10, screen-translate-dev, this dev CPU, release build)

Owner-authorized second round to close the R1 Vietnamese gap. STILL SPIKE-ONLY (no capture/, no pipeline, no IPC change). Harness: `tests/ocr_spike_r2.rs` (env-gate `OST_OCR_SPIKE_R2=1`, feature `ocr-spike`); added `ModelSet::MAIN_SERVER`, `fixtures::upscale()` (Lanczos3), `fixtures::vi_charset_probe()`. No new/changed deps.

### Charset-vs-DPI verdict: CHARSET GAP CONFIRMED, DPI hypothesis REFUTED
Evidence that decided it (three independent, agreeing):
1. **Dict inspection** - `ppocrv5_latin_dict.txt` (the Vietnamese/latin rec dict, 837 tokens) contains the base Vietnamese letters `đ ơ ư à` (and caps) but ZERO of the Latin-Extended-Additional block U+1E00-U+1EFF that holds the composed tone-mark glyphs (`ả ạ ử ụ ầ ế ...`), and no combining diacritical marks either. The main CJK dict `ppocrv5_dict.txt` (18,389 chars) has only `đ`. So no PP-OCRv5 rec model in oar-ocr 0.8.0 has the vocabulary to emit vi tone marks.
2. **Theoretical ceiling == measured** - if the model recognizes every in-charset char perfectly and can only drop the out-of-charset tone-mark chars, the max space-insensitive accuracy is 20/27=0.741 (vi-general) and 16/22=0.727 (vi-subtitle). These match the R1 measurements to 3 decimals - the model is already at its charset ceiling.
3. **Large clean crop probe** - a 96px, 1400x220 vi crop dense in composed glyphs ("Tiếng Việt rất đẹp và dễ đọc khó", ref has 6 composed-vi glyphs) yields hyp "Ting Vit rt đp và d đc khó" - the latin rec emits 0 composed-vi glyphs at 1.0x, 2.0x AND 3.0x. Font is far larger than any DPI limit; the glyph class simply does not exist in the softmax output.

Conclusion: upscaling cannot add vocabulary that isn't in the model. Vietnamese quality here is a MODEL-SELECTION problem, not a preprocessing one.

### R2 measurement table (this dev CPU, release)
| config | vi-general | vi-subtitle | EN/JA/vert/low-DPI/ko/zh | p95 (agg) | idle RAM (post-drop) | rec download |
|--------|-----------|-------------|--------------------------|-----------|----------------------|--------------|
| mobile latin/main (R1 pinned) | 0.741 | 0.727 | all 1.000 | 210-277 ms | 38-39.5 MB | 15.80 MB (main) + 7.70 MB (latin) |
| mobile + upscale 1.5x | 0.667 | 0.727 | (n/a - vi path) | +~15% latency | - | +0 |
| mobile + upscale 2.0x | 0.667 | 0.727 | - | +~30% latency | - | +0 |
| mobile + upscale 3.0x | 0.704 | 0.727 | - | +~50% latency | - | +0 |
| server main rec | 0.593 | 0.636 | EN-400x100 0.639, JA-sub 0.889, rest 1.000 (REGRESS) | **1404.5 ms (FAIL)** | ballooned | 80.59 MB (+64.79 MB) |

- Upscale (Lanczos3, chosen for sharpest windowed-sinc upsampling of stroke/diacritic detail - the most favourable filter, so a null result is a strong refutation): does NOT lift vi; flat or slightly worse (Lanczos ringing on already-clean renders adds errors), never near 0.85. Latency rises with factor.
- Server main rec (`pp-ocrv5_server_rec.onnx`, 80.59 MB): worse on every axis - vi worse (CJK dict has even fewer Latin diacritics), REGRESSES EN small-crop (0.639) and JA subtitle (0.889) vs mobile's 1.000, and p95=1404.5 ms **exceeds the 700 ms budget ~2x**. There is NO latin/Vietnamese server rec in oar-ocr 0.8.0 - only latin MOBILE. Rejected.
- Cold first-call: mobile 415-429 ms (session build, models cached); server ~95 s on first-ever (includes ~80 MB one-time download).

### R1 reproduction (nothing regressed)
Latency p95 (mobile) 210 ms (R1 277); EN/JA/ja-vertical/low-DPI/ko/zh all 1.000 (identical); vi 0.741/0.727 (identical); per-line confidence 0.967-1.000 (identical, `PerLine`); lazy-load proven (10.4 MB after `new()`, `is_loaded()==false`); single-session RAM 104.6 MB (R1 104.1); idle post-drop 38.0 MB (R1 39.5). Caveat surfaced: tone-mark drops do NOT lower confidence (model confidently emits the in-charset base letter, mean vi conf 0.970) - so the low-confidence flag will NOT catch the missing diacritics.

### R2 DECISION / escalation (owner call)
No configuration in the ADR-004 PP-OCRv5/oar-ocr 0.8.0 stack clears vi >= 0.85; the two candidate remedies (upscale, heavier rec) are both refuted with numbers, and the server rec additionally blows the latency budget and regresses EN/JA (owner's highest-weight axis). **Recommended config = the R1 pinned one unchanged** (PP-OCRv5 mobile: main + latin + korean rec, mobile det): EN/JA/ko/zh/vertical/low-DPI 1.000, p95 ~230 ms, idle ~40 MB. Vietnamese stays at its charset ceiling (0.74/0.73: base letters + word structure correct, composed tone marks dropped). Clearing 0.85 requires a Vietnamese-tone-capable rec model, which is OUTSIDE the oar-ocr 0.8.0 catalog and thus outside ADR-004 scope - owner options: (a) accept ~0.74 for MVP as "covered" (LLM translate is fairly robust to missing diacritics, but the low-confidence flag will not mark them); (b) import a vi-finetuned Paddle rec ONNX + extended dict as a raw model behind the same trait; (c) a Tesseract `vie` or multimodal/cloud vi path (separate, owner-gated, security-reviewed egress). Integration gate stays CLOSED for the orchestrator.

## To do (pipeline - integration gate OPENED by owner, option (a) 2026-07-10)
- [x] `capture/`: Windows region capture behind `ScreenCapturer` (xcap 0.9.6, `capture_region`) + fixture-image crop tests + no-disk-write guard (AC-02.5).
- [x] `ocr/`: PaddleOCR PP-OCRv5 via oar-ocr behind `OcrEngine`; confidence surfaced per line as `PerLine` (AC-02.6); `Unavailable{reason}` variant kept for future backends.
- [x] FIDELITY DECLARATION: `OcrEngine::fidelity(lang) -> OcrFidelity{Full|Degraded{reason}}`; PaddleOcrEngine returns `Degraded` for vi (names U+1E00-U+1EFF charset gap), `Full` for en/ja/ko/zh.
- [x] Pipeline wiring in `shell/region.rs`: confirm/preview-ready -> capture -> OCR -> emit `region:ocr-result` (with `fidelity`); `request_region_translation` -> provider layer -> emit `region:translation-result`/`region:translation-error`.
- [x] ORT session-drop discipline: `PaddleOcrEngine::unload()` called on `close_region_preview`; unit test + feature-gated real load->unload test (NFR-PERF-03 / NFR-REL-02).
- [x] `OcrResultPayload` extended with `fidelity`; `docs/architecture/api-contracts/ipc.md` updated in the same PR.
- [x] Criterion `capture->OCR` bench wired (`benches/ocr_stage.rs` group `capture_to_ocr`).
- [x] Local-only: no cloud OCR dependency or code path in this task (ADR-004 sequencing).
- [x] S1 FIX: source-language selection plumbed (`confirm_region_selection(sourceLanguage)` -> `RegionState` -> pipeline); fidelity keyed off the SELECTED language, never post-OCR detection; `ipc.md` documents `SourceLanguage`.
- [x] Per-language rec routing (`rec_model_for_language`): vi/latin -> latin rec, ja/zh/en -> main, ko -> korean, auto -> main; `RegionPipeline` holds all three engines.
- [x] `region:ocr-error` event added + emitted on capture/OCR failure (no silent swallow); payload treats diagnostic string as untrusted DATA; `ipc.md` updated.
- [x] Shared fail-closed model-consent facility `src-tauri/src/models/` (generic descriptor; persisted+revocable via tauri-plugin-store; discloses ModelScope host/sizes/destination; SHA-256 kept); OCR path gated before download; `models:consent-required` event + consent commands; `ipc.md` updated.

## Test scenarios / acceptance
- [x] Spike gate above passes FIRST (latency, JA-vertical, low-DPI EN+JA, confidence, Vietnamese fixture, idle footprint, CI benchmark). (R1+R2 done)
- [x] Synthetic rendered-text images OCR correctly (Latin + Vietnamese + JA fixtures). (R1 spike; pipeline uses same engine)
- [x] Low-confidence lines flagged in the event payload (BR-05 / AC-02.6). (`build_ocr_payload_joins_lines_and_flags_low_confidence`)
- [x] Fidelity declaration surfaced for degraded languages even at high confidence (`build_ocr_payload_attaches_degraded_fidelity_for_vietnamese`; human-in-the-loop.md).
- [x] Screenshot never written to disk and never leaves the machine on the local path (AC-02.5 / NFR-SEC-03). (`capture_keeps_pixels_in_memory_and_writes_no_file`; IPC carries text only)
- [x] Empty OCR -> empty `sourceText`, no translate call (AC-02.7). (`build_ocr_payload_surfaces_empty_text_for_no_recognition` + command guard)
- [x] Criterion benchmark on the capture -> OCR path exists (`capture_to_ocr` group; OCR-stage p95 recorded in R1 = 277ms <= 700ms budget).
- [x] Fidelity keyed off SELECTED language, not OCR output (S1 regression guard `build_ocr_payload_declares_degraded_when_vi_is_selected_regardless_of_output`; trait-level `fidelity("vi")==Degraded` kept).
- [x] Model download is fail-closed on consent (`recognize_fails_closed_without_consent_and_never_loads` proves ConsentRequired with no network + no session load; `models::consent` unit tests cover grant/revoke/persist; real-download stays feature-gated `ocr-spike`).
- [x] Per-language routing unit-tested (`rec_model_routing_sends_vietnamese_and_latin_to_the_latin_rec`); source-language parse tested; `region:ocr-error` payload serialization tested.
- [x] AC-02.6 end-to-end Degraded-notice UI test (frontend). `RegionPreviewView.test.tsx` > "shows the standing degraded-fidelity notice for a vi source even when lowConfidence is false (AC-02.6)" - asserts the standing notice renders on `fidelity.kind === "degraded"` while `lowConfidence === false` and the low-confidence banner does NOT; the engine reason is surfaced as plain-text DATA. This is the test that would have caught S1 on the UI side.
- [x] Frontend consumption of the new IPC contracts: `region:ocr-error`, `models:consent-required` + consent commands, `OcrFidelity` union, `SourceLanguage`, `confirm_region_selection(sourceLanguage)` - all mirrored in `src/lib/ipc.ts` (typed wrapper only, no scattered invoke).

### Deferred (post-TASK-009)
- Settings "revoke consent" control is DEFERRED until TASK-009's SettingsView lands in main. The `modelIpc.revokeConsent(modelSetId)` wrapper is implemented and ready; a `// TODO(TASK-007 post-TASK-009): revoke consent control in Settings` marker sits next to it in `src/lib/ipc.ts`. Wire the toggle during the post-TASK-009 rebase.

## Orchestration notes
- 2026-07-09: unblocked by ADR-004 acceptance (owner sign-off). Scoped LOCAL-ONLY: PaddleOCR PP-OCRv5 default; cloud backends are separate, owner-gated, sequenced AFTER the local engine is proven, each with a security-reviewer pass on the image-egress path.
- The R1 latency spike is step one and an explicit gate; pipeline integration must not start until it passes and the orchestrator confirms.
- 2026-07-10: TASK-007 gate outcomes recorded. code-review B1 (commit subjects) and security BLOCKER (model-download consent) block merge; fidelity S1 (trigger from post-OCR detection) requires source-language selection which is cross-scope. Follow-up task to be registered AFTER TASK-007/009 land (avoids master-plan row conflict): complete the FR-02 loop - source-language selection + fidelity trigger + per-language rec routing (main/latin/korean) + region:ocr-error event + Degraded-notice UI + model-download consent DIALOG UI. The fidelity requirement is NOT declared met until that follow-up lands.
- 2026-07-10: owner folded the FR-02 loop INTO TASK-007 (not split). Fixes landed on feat/region-capture-ocr (Rust + IPC-contract half only; the React Degraded-notice + consent-dialog UI is a frontend follow-up).

### S1 ANALYSIS - fidelity MUST NOT be derived from post-OCR detected language (do not re-introduce)

Root cause: the pre-fix `build_ocr_payload` set `fidelity = engine.fidelity(detect_language(ocr_text))`. This is STRUCTURALLY incapable of ever declaring Vietnamese Degraded, which is the ONE case the declaration exists for:
1. PP-OCRv5 latin rec has no U+1E00-U+1EFF glyphs in its dict (R2 spike), so it DROPS the composed vi tone marks (ả/ạ/ử/ụ/ầ/ế ...) from its output.
2. `detect_language` keys "vi" on exactly those U+1E00-U+1EFF markers (plus ă/â/đ/ê/ô/ơ/ư). With the tone-marked glyphs gone, the OCR text looks like plain latin -> detected "en" -> `fidelity("en") = Full`.
3. Net: for real Vietnamese input the Degraded notice can NEVER fire; it would only (accidentally) fire if the model had NOT dropped the marks - i.e. exactly when it is not needed. Self-defeating.

Fix (implemented): fidelity is derived from the USER-SELECTED source language (BR-07 manual pin), never from OCR output. `SourceLanguageSelection::{Auto, Pinned}` is plumbed through `confirm_region_selection(sourceLanguage)` -> `RegionState` -> `region_preview_ready` -> `build_ocr_payload`. When `vi` is pinned, `fidelity = Degraded` deterministically regardless of the recognized text. When Auto (no pin), auto-detect is a best-effort HINT only (`detectedLanguage` field) and fidelity is NOT asserted Degraded. Regression guard: `build_ocr_payload_declares_degraded_when_vi_is_selected_regardless_of_output` (ASCII OCR output + vi selected -> Degraded) is the test that would have caught S1. DO NOT move the fidelity source back to post-OCR detection.
- Per-language rec routing added (`rec_model_for_language`): vi + other latin -> latin rec (fixes the main()-only wiring so vi actually uses latin), ja/zh/en -> main, ko -> korean, auto -> main. `RegionPipeline` now holds all three engines, each behind the shared consent gate; `close_region_preview` unloads all three.
- Shared model-consent facility built in NEW `src-tauri/src/models/` (generic over `ModelSetDescriptor`; whisper STT is the Phase-2 second consumer). FAIL-CLOSED in Rust: `ModelGate::ensure_download_allowed` is called BEFORE oar-ocr's auto-download inside `PaddleOcrEngine::build_pipeline`; until consent it returns `ConsentRequired` (disclosure) and the pipeline emits `models:consent-required` instead of downloading. Consent persisted via tauri-plugin-store (flags/names only) and revocable via `revoke_model_consent`. Disclosure NAMES the host (ModelScope, modelscope.cn), lists artifact sizes and the destination. OAR_HOME kept as oar-ocr's cache owner (default ~/.oar) - not force-overridden to repo `models/` (documented in `models::resolve_model_cache_dir`); oar-ocr does the HTTPS fetch + internal SHA-256 verify, and `models::verify_sha256` is the shared verify primitive for self-fetching consumers. `.gitignore` `models/` re-anchored to `/models/` so it stops shadowing the new Rust module.
- AC-02.6 is NOT declared met: it remains gated on the frontend end-to-end Degraded-notice test the next agent adds.

## Session log (AI session log)

| Date | Who | What was done | Result |
|------|-----|---------------|--------|
| 2026-07-09 | orchestrator | Task created and registered in master-plan (bootstrap seed) | Planned |
| 2026-07-09 | orchestrator | Unblocked on ADR-004 acceptance; status Planned -> Active; task refreshed with the R1 OCR latency spike as step-one gate (p95 <= 700ms, JA-vertical, low-DPI EN+JA, confidence availability, Vietnamese fixtures, idle probe, CI benchmark); pipeline integration gated behind the spike | Active |
| 2026-07-09 | screen-translate-dev | Ran R1 OCR spike (step one only): added `OcrEngine` trait + `PaddleOcrEngine` (oar-ocr 0.8.0 + ort 2.0.0-rc.12, lazy ORT session), synthetic fixture generator (feature `ocr-spike`), harness `tests/ocr_spike.rs`, criterion `benches/ocr_stage.rs`. Measured latency p95=277ms (<=700 PASS), EN/JA/ja-vertical/low-DPI/ko/zh accuracy=1.000, per-line `PerLine` confidence confirmed, lazy load + idle RAM PASS. Vietnamese covered but 0.73-0.74 (tone-mark drops) below the 0.85 bar. cargo fmt/clippy -D warnings clean, unit tests green. No IPC/pipeline wired (gated) | Spike PASS on all mandatory criteria; Vietnamese quality escalated to orchestrator/owner; integration gate stays closed |
| 2026-07-10 | screen-translate-dev | Ran R2 OCR spike (owner-authorized vi round, spike-only): added `ModelSet::MAIN_SERVER`, `fixtures::upscale()` (Lanczos3), `fixtures::vi_charset_probe()`, harness `tests/ocr_spike_r2.rs` (env `OST_OCR_SPIKE_R2=1`). No dep change. CHARSET GAP CONFIRMED / DPI REFUTED via 3 agreeing lines of evidence (dict lacks U+1E00-U+1EFF; theoretical ceiling == R1 measured; large clean crop emits 0 composed-vi glyphs at 1/2/3x). Upscale flat/worse (0.667-0.741); server main rec worse on every axis + p95=1404ms FAIL + regresses EN/JA. No latin server rec exists in oar-ocr 0.8.0. R1 numbers reproduced, nothing regressed. cargo fmt/clippy -D warnings clean, R2 harness green. No pipeline/IPC touched (gate stays closed) | vi 0.85 unreachable in the PP-OCRv5/oar-ocr 0.8.0 stack; reframed as model selection; recommend keeping R1 config; escalated to owner |
| 2026-07-10 | screen-translate-dev | Integration (owner opened gate, option (a) accept ~0.74 vi + MANDATORY fidelity declaration). Built `capture/` (`ScreenCapturer` trait, xcap 0.9.6 `WindowsScreenCapturer`, pure `crop_rgba_to_rgb`, no-disk-write guard test AC-02.5); added `OcrFidelity{Full,Degraded{reason}}` + `OcrEngine::fidelity(lang)` (vi Degraded naming U+1E00-U+1EFF, en/ja/ko/zh Full); `PaddleOcrEngine::unload()` drops ORT session on session end + real load->unload test (feature-gated); wired `shell/region.rs` pipeline (capture->OCR->`region:ocr-result` with `fidelity`; `request_region_translation`->Gemini provider->`region:translation-result`/`-error`); removed debug mock pipeline; extended `OcrResultPayload` with `fidelity` + updated `ipc.md`; added `capture_to_ocr` criterion group; xcap dep added, `scripts/cargo-wt.bat` gitignored. cargo fmt clean; clippy -D warnings clean (default + ocr-spike); 91 unit tests pass + gated ORT-release test pass | Pipeline integrated on R1 pinned config with fidelity declaration; all gates green locally; open items: target-language + provider selection wiring from Settings (cross-scope), per-language rec routing (main/latin/korean) follow-up, no OCR-error IPC event yet |
| 2026-07-10 | qa-test | Quality-gate verification of the integrated pipeline (commit 64aac5a). Reproduced green: cargo fmt --check clean, clippy -j 2 --all-targets -D warnings clean, cargo test -j 2 = 91 passed / 0 failed (default features). Built the coverage matrix against FR-02 AC-02.5/02.6/02.7 + fidelity + ORT-drop + provider-mocked criteria - all had tests except two seams; added `ocr_result_payload_embeds_degraded_fidelity_and_keeps_low_confidence` (payload-level degraded tagged union + lowConfidence coexist) and `empty_or_whitespace_source_text_is_guarded_before_translation` (AC-02.7 translate-guard predicate). No production behavior changed; flagged follow-up gaps left to their owners. cargo fmt/clippy -D warnings clean; 93 unit tests pass | Suite verified green (93 passed); coverage complete for AC-02.5/02.6/02.7/fidelity/provider-mock; two limitations noted: the ORT is_loaded() true->false transition is only exercised by the opt-in `ocr-spike` test (needs a real ORT session), and the `close_region_preview`/`request_region_translation` command wiring is not unit-testable (needs a live Tauri AppHandle) |
| 2026-07-10 | code-reviewer | Full-diff gate on 34f856f. Clean: trait boundaries swappable, no unwrap outside tests/entry, heavy work off the async runtime, all LLM I/O via providers/, lazy-load+unload, ipc.md union matches serde, deps pinned. BLOCKER B1: two commit subjects >72 chars (feat-wire=74, test-cover=78) trip the commit-msg hook. SHOULD-FIX S1: fidelity is derived from POST-OCR detected language - self-defeating, since dropped vi tone marks remove the markers detect_language keys on, so vi falls back to en=Full and the Degraded notice never fires for its one intended case; pipeline also wires main() rec not latin. | CHANGES-REQUESTED |
| 2026-07-10 | security-reviewer | Mandatory (captured content + model-download egress). Verified: captured pixels in-memory only, never to disk/off-machine (IPC carries coords + text only), no pixel/key in logs, OCR text separated as DATA in the Gemini prompt, Degraded declaration proven on a high-confidence vi payload. BLOCKER: first-run OCR model download auto-fetches modelscope.cn with NO consent gate (paddle.rs build_pipeline reached silently from region_preview_ready) - violates security-privacy.md user-confirmed-first-run-download; HTTPS+SHA256+model-path-only URL so no user data leaks, but consent required; owner-waivable MUST-rule. NITs: no-disk test only exercises stub seam; model cache in $OAR_HOME not models/; xcap native dep logged. | CHANGES-REQUESTED |
| 2026-07-10 | screen-translate-dev | Addressed both review gates on feat/region-capture-ocr. S1 fix: added `SourceLanguageSelection` plumbed through `confirm_region_selection(sourceLanguage)` -> RegionState -> pipeline; `build_ocr_payload` now derives fidelity from the SELECTED language (Degraded for pinned vi regardless of OCR text), detected-language demoted to a hint; wrote the S1 analysis into orchestration notes. Per-language rec routing (`rec_model_for_language`): vi/latin->latin, ja/zh/en->main, ko->korean, auto->main; RegionPipeline holds 3 engines, unload_all on close. Added `region:ocr-error` event (emitted on capture/OCR failure, untrusted DATA). Built shared `src-tauri/src/models/` fail-closed consent facility (descriptor/consent/store/verify): `ModelGate::ensure_download_allowed` gates PaddleOcrEngine before oar-ocr auto-download; ConsentRequired -> `models:consent-required` event; consent persisted via tauri-plugin-store (flags only) + revocable via `grant/revoke/model_consent_status` commands; disclosure names ModelScope/modelscope.cn + sizes + destination; `verify_sha256` helper. Re-anchored `.gitignore` `models/`->`/models/` (was shadowing the new Rust module). Updated ipc.md (SourceLanguage, region:ocr-error, consent commands/events, ConsentDisclosure). New deps: tauri-plugin-store, sha2, hex (pinned). cargo fmt --check clean; clippy --all-targets -D warnings clean (default + ocr-spike); cargo test -j 2 = 109 passed / 0 failed. NOT verified: real capture on a live display, real ModelScope download (feature-gated off). | Both gates addressed on branch; AC-02.6 still gated on frontend Degraded-notice UI |
| 2026-07-10 | frontend-ui-dev | Built the FR-02 UI half consuming the new Rust IPC contracts. `src/lib/ipc.ts` (typed wrapper only): added `SourceLanguage`, `OcrFidelity` union, `OcrErrorPayload`, `ConsentArtifact`/`ConsentDisclosure`/`ModelConsentStatus`, event consts `region:ocr-error` + `models:consent-required`, `confirmSelection(region, sourceLanguage?)`, and a `modelIpc` group (consentStatus/grantConsent/revokeConsent). BR-07 source-language Select (default Auto) added to `RegionSelectView`, plumbed via `useRegionSelection` into `confirm_region_selection`. AC-02.6 STANDING Degraded notice in `RegionPreviewView`/`useRegionPreview`: renders on `fidelity.kind === "degraded"` INDEPENDENT of lowConfidence, states diacritics may be dropped + not confidence-flagged, reason via PlainText. `region:ocr-error` handling (own i18n copy, never the raw message; leaves the recognizing state). Fail-closed consent dialog: new `Dialog` primitive (created+barrelled+tested+registered in design-system.md) + `ConsentDialog` composite disclosing ModelScope/modelscope.cn, sizes, destination as plain-text; grant calls `grant_model_consent` then re-signals `region_preview_ready`; decline closes without granting and shows a blocked notice + review affordance. Added `formatBytes` helper + i18n vi/en keys (fully accented). Tests: added the AC-02.6 Degraded test (the S1-catcher), consent grant/decline, ocr-error, Dialog, formatBytes, BR-07 pin tests; updated existing confirm-selection assertions for the new arg. npm run test = 97 passed / 0 failed (12 files); npm run lint clean; tsc --noEmit clean. Settings revoke control DEFERRED to post-TASK-009 (TODO marker in ipc.ts). No src-tauri/ or Rust touched. NOT verified: live Tauri window/event round-trip (mocked IPC per known-issues e2e limit); real ModelScope download. | FR-02 UI half complete on branch; AC-02.6 Degraded-notice UI test in place and green |
| 2026-07-10 | qa-test | Full-task quality gate (Rust expansion + frontend UI commit d913d70). Reproduced GREEN: cargo fmt --check clean; clippy --all-targets -D warnings clean (default AND --features ocr-spike); cargo test -j 2 = 109 passed / 0 failed (providers mocked via wiremock, no network/model download). Frontend: vitest = 97 passed / 0 failed (12 files); npm run lint (eslint + prettier) clean; tsc --noEmit clean. Confirmed the AC-02.6 / S1 gate `shows the standing degraded-fidelity notice for a vi source even when lowConfidence is false (AC-02.6)` in RegionPreviewView.test.tsx PASSES (standing role=status notice, low-confidence banner absent, engine reason as plain text). Confirmed consent grant/decline, region:ocr-error localized-no-raw-message, and the Rust fidelity/fail-closed/grant-revoke-persist/rec-routing tests all present and green. Coverage gap found and closed: added `pipeline_error_routes_only_consent_refusals_to_the_consent_event` pinning the Rust-side consent-required-vs-ocr-error classification branch (`PipelineError::consent_disclosure()`) - the emission path itself needs a live AppHandle. No production behavior changed. cargo fmt/clippy -D warnings clean; 110 unit tests pass. | Full task verified green (Rust 110 + frontend 97); AC-02.6 gate confirmed passing; one added Rust test; unverifiable seams noted (live Tauri emit path, real ModelScope download) |
| 2026-07-10 | security-reviewer | Re-review of egress fix (mandatory). PRIOR BLOCKER RESOLVED: model download is fail-closed in Rust - recognize() calls gate.ensure_download_allowed before build_pipeline; all 3 production engines carry the gate, no gate-less production build, test proves no session loads without consent, UI cannot bypass. Disclosure names ModelScope/modelscope.cn + sizes + destination; consent persisted flags-only + revocable; SHA256 + HTTPS retained; captured pixels in-memory only; OCR/error text sanitized to plain text; keys unregressed. NITs: Option<gate> None-skips (future footgun); destination embeds OS username (local-only). | PASS |
| 2026-07-10 | code-reviewer | Re-review. B1 RESOLVED (all subjects <=72, clean scopes, no attribution) and S1 RESOLVED (fidelity keyed off SELECTED source language; regression test proves Degraded for vi-pinned regardless of ASCII output; per-language routing wired). Clean: models/ trait-based+generic, fail-closed gate, no unwrap outside tests, heavy work off async runtime, LLM I/O via providers/, design-system HARD GATE (Dialog primitive), IPC via typed wrapper no any, i18n vi+en accented, ipc.md matches serde. NEW BLOCKER: region_preview_ready take()s pending_region before OCR; on the consent-required path the region is consumed, so after grant the re-called previewReady finds None and no OCR runs - first-run preview hangs (breaks ipc.md re-arm + no-silent-hang). NITs: revokeConsent dead until post-TASK-009; env-mutating test. | CHANGES-REQUESTED |
| 2026-07-10 | screen-translate-dev | Fixed the consent-grant first-run hang BLOCKER (scoped lifecycle fix, no fidelity/consent-semantics change). Extracted `take_and_recognize` core from `region_preview_ready`: it takes `pending_region`, runs capture->OCR, and on an `OcrError::ConsentRequired` refusal RESTORES the region into `RegionState` (option (a)/(c)) so the subsequent `grant_model_consent` + re-called `region_preview_ready` runs OCR; any other (terminal) PipelineError leaves the region cleared so the preview emits `region:ocr-error` with no re-arm loop. `region_preview_ready` now takes only `AppHandle` and fetches managed `RegionState`/`RegionPipeline` inside the worker thread (managed `State` cannot cross the `'static` thread boundary). Added 2 Rust tests: `consent_required_keeps_region_and_grant_reruns_ocr` (consent refusal keeps region -> grant -> re-call runs OCR to an ocr-result, region then consumed) and `terminal_ocr_error_clears_region_and_does_not_re_arm` (Inference error clears region, re-call returns None). OPTIONAL security hardening in paddle.rs: `#[cfg(not(feature = "ocr-spike"))] debug_assert!(self.gate.is_some())` before the download build plus a release-build `tracing::warn!` on the gate-less branch, so a future production caller forgetting `with_consent_gate()` gets a signal while the spike/bench feature stays legitimately gate-less. cargo fmt --check clean; clippy --all-targets -D warnings clean (default AND --features ocr-spike); cargo test -j 2 = 112 passed / 0 failed. Untouched: fidelity trigger, consent facility semantics, ipc.md shapes, src/ React. | BLOCKER fixed on branch; two lifecycle tests green; gate-mandatory hardening added as debug_assert+warn (low-risk); not verified: live Tauri emit round-trip, real ModelScope download |
| 2026-07-10 | code-reviewer | Focused re-review of fix e0c305b. Prior consent re-arm BLOCKER RESOLVED: take_and_recognize restores the region on ConsentRequired refusal (grant + re-called region_preview_ready re-runs OCR) and clears it on terminal errors (region:ocr-error, no re-arm loop); two round-trip tests would fail against the old code; managed State fetched inside the worker thread (no borrow issue); paddle.rs debug_assert hardening does not weaken production fail-closed. Subjects <=72, no new unwrap outside tests, fmt/clippy clean, 112 tests. NITs non-blocking. | PASS |
| 2026-07-10 | screen-translate-dev | Rebased approved branch onto main (3729187, PRs #10/#13/#14 landed) - rebase-and-resolve only, no approved behavior changed. Four union conflicts resolved: (1) `ipc.md` kept main's provider-key/settings command sections AND the branch's model-consent commands/events + ConsentDisclosure; (2) `Cargo.toml` kept all deps from both sides, single `tauri-plugin-store = "=2.4.3"` (subsumes main's ^2.2.0 and the consent facility's exact pin), plus sha2/hex/xcap/oar-ocr/image, no duplicate keys; (3) `lib.rs` kept a single tauri-plugin-store plugin registration serving both settings + consent, and unioned all invoke_handler entries (region:* + settings/keys + model-consent) and both .manage/setup blocks; (4) `translations.ts` kept both settings keys and consent/region/ocr keys in en+vi, vi fully accented. design-system.md auto-merged with both Input (main table) and Dialog (branch mini-table) rows intact. Regenerated Cargo.lock via cargo (no hand-edit); ran npm install to sync node_modules with main's @tauri-apps/plugin-store dep. Re-verified full suite on rebased tree: cargo fmt --check clean; clippy --all-targets -D warnings clean (default AND --features ocr-spike); cargo test = 124 passed / 0 failed default (125 + 2 integration with ocr-spike), run serialized (--test-threads=1) per the loopback known-issue - parallel wiremock servers falsely timeout; AC-02.6 build_ocr_payload_declares_degraded_when_vi_is_selected and fail-closed consent tests (consent_required_keeps_region_and_grant_reruns_ocr, pipeline_error_routes_only_consent_refusals_to_the_consent_event, terminal_ocr_error_clears_region) all PASS. Frontend: vitest 142 passed / 0 failed (18 files); npm run lint clean; tsc --noEmit clean. Force-pushed with --force-with-lease. | Rebased onto main; four unions resolved, no approved behavior changed; full suite green |

| 2026-07-10 | orchestrator | Closed out TASK-007. PR #12 merged to main (merge commit 24f0254) after rebase onto 3729187; CI lint-and-test green; code-reviewer PASS, security-reviewer PASS (egress/consent), qa-test green (Rust 124 / frontend 142). Board row + frontmatter flipped to Done; file moved to done/; worktree removed and merged branch deleted. | Done |

## Result
Region-translate pipeline (FR-02 Rust core + its UI half) is on `main` - PR #12, merge
commit `24f0254` (rebased onto `3729187`).

Delivered:
- `capture/`: `ScreenCapturer` trait + `WindowsScreenCapturer` (xcap 0.9.6), pure
  `crop_rgba_to_rgb`, pixels in-memory only with a no-disk-write guard test (AC-02.5).
- `ocr/`: PaddleOCR PP-OCRv5 via oar-ocr 0.8.0 + ort 2.0.0-rc.12 behind `OcrEngine`; lazy
  ORT session (never at app start), `unload()` drop on session end (NFR-PERF-03/NFR-REL-02);
  per-line confidence as `OcrConfidence::PerLine`, `Unavailable{reason}` variant kept.
- Mandatory fidelity declaration `OcrFidelity{Full|Degraded{reason}}` keyed off the
  user-SELECTED source language (BR-07), not post-OCR detection; vi is `Degraded` (names the
  U+1E00-U+1EFF charset gap) even at high confidence (AC-02.6, per the v1.2 spec amendment).
- Per-language rec routing (vi/latin -> latin, ja/zh/en -> main, ko -> korean, auto -> main).
- Pipeline in `shell/region.rs`: capture -> OCR -> `region:ocr-result` (with fidelity) ->
  provider translate -> `region:translation-result`/`-error`; `region:ocr-error` on failure
  (diagnostic string treated as untrusted DATA); empty-OCR guard suppresses the LLM call
  (AC-02.7).
- Shared fail-closed first-run model-consent facility `src-tauri/src/models/` (generic
  descriptor, ModelScope disclosure of host/sizes/destination, SHA-256, persisted flags-only
  + revocable) - `ensure_download_allowed` gates the OCR model download; whisper reuses this
  in Phase 2 (do NOT build a second gate).
- UI: `Dialog` primitive (design-system Landed row) + `ConsentDialog`, BR-07 source-language
  Select, the standing Degraded-fidelity notice, `region:ocr-error` localized handling.
- `benches/ocr_stage.rs` criterion `capture_to_ocr` group; `docs/architecture/api-contracts/
  ipc.md` updated in-PR.

Spike / measured numbers (R1+R2, this dev CPU, release):
- OCR-stage latency p95 ~230 ms (budget <= 700 ms): PASS.
- Accuracy EN / JA / ja-vertical / low-DPI EN+JA / ko / zh: 1.000.
- Vietnamese: 0.741 general / 0.727 subtitle - at the PP-OCRv5 latin charset CEILING (the rec
  dict lacks the U+1E00-U+1EFF composed tone-mark glyphs; upscaling and the server rec were
  both refuted, server rec also blew latency to 1404 ms). Owner accepted ~0.74 for MVP
  (option (a)); the diacritic drops carry HIGH confidence so the low-confidence flag will NOT
  mark them - the standing Degraded notice is the surfaced signal. A vi-capable rec model is a
  separate, later task, distinct from the opt-in cloud OCR egress task.
- RAM: single resident ORT session ~104 MB; true-idle (session not loaded) and session-dropped
  ~38-40 MB - NFR-PERF-03 (<100MB idle) holds ONLY with the one-session-at-a-time drop
  discipline (a resident session is ~94 MB over baseline); that enforcement is TASK-019.
- Per-line confidence available and distribution recorded for OI-07.

Tests (post-rebase, verified in the session log): cargo test 124 passed / 0 failed (default;
125 lib + 2 integration with `--features ocr-spike`), run serialized per the wiremock loopback
known-issue; vitest 142 passed / 0 failed; clippy -D warnings + fmt + eslint + prettier + tsc
all clean.

Carried forward (NOT done here, registered as follow-ups):
- Settings revoke-consent control for model downloads (needed TASK-009's SettingsView) -> TASK-012.
- Idle-budget enforcement + ORT/whisper session-drop discipline -> TASK-019.
- Opt-in cloud OCR backends (BR-09 egress) -> TASK-011. vi-capable rec is a separate remedy.
Unverified seams: live Tauri event emit round-trip (mocked per e2e known-issue) and a real
ModelScope download (feature-gated off; no real network in tests).
