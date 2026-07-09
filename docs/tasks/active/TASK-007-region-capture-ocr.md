---
title: "TASK-007: Region capture + OCR pipeline (Rust side)"
status: Planned
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
Given region coordinates over IPC, the Rust core captures the region, runs OCR, and emits
recognized text (then translated text via the provider layer) as Tauri events.

## Inputs / context
- FR-02 spec; ADR-004 (OCR engine, from TASK-005); traits `ScreenCapturer`, `OcrEngine`.
- Budget: p95 < 2s from selection to translated preview.

## To do
- [ ] `capture/`: Windows region capture behind `ScreenCapturer` + fixture-image tests.
- [ ] `ocr/`: chosen engine behind `OcrEngine`; confidence surfaced per block.
- [ ] Pipeline wiring: capture -> OCR -> emit `ocr-result` event -> provider translate ->
      emit `translation-result` event (incremental preview contract).
- [ ] `docs/architecture/api-contracts/ipc.md` updated in the same PR.

## Test scenarios / acceptance
- [ ] Synthetic rendered-text images OCR correctly (Latin + Vietnamese fixture).
- [ ] Low-confidence blocks are flagged in the event payload (BR-05).
- [ ] Criterion benchmark on the capture->OCR path exists and meets budget locally.

## Session log (AI session log)

| Date | Who | What was done | Result |
|------|-----|---------------|--------|
| 2026-07-09 | orchestrator | Task created and registered in master-plan (bootstrap seed) | Planned |

## Result
<Fill when moving to Done.>
