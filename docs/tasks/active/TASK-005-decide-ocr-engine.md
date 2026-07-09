---
title: "TASK-005: Decide the OCR engine (/brainstorm -> ADR)"
status: Blocked
fr: "FR-02"
owner: brainstormer
deps: "TASK-003"
priority: P0
phase: 1
created: 2026-07-09
tags: [task]
---

# TASK-005: Decide the OCR engine (/brainstorm -> ADR)

## Goal
An Accepted ADR choosing the OCR engine for FR-02, unblocking TASK-007.

## Inputs / context
- Candidates to evaluate (tech-researcher gathers evidence): Windows.Media.Ocr (via
  `windows` crate - fast, zero-install, Windows-only), Tesseract (cross-platform, heavier,
  quality varies), PaddleOCR (best multilingual quality, large runtime), cloud OCR
  (contradicts local-first privacy - likely reject).
- Constraints: region translate p95 < 2s budget; Vietnamese + CJK + Latin support matters;
  Windows-first but a trait-swappable path for Phase 4.

## To do
- [x] `/brainstorm ocr engine for region translate` with trade-off matrix.
- [x] ADR-004 drafted from the brainstorm outcome (status Proposed).
- [ ] User accepts ADR-004.
- [ ] Update tech-stack.md OCR row (after acceptance; decisions README index already
      carries the Proposed row).

## Orchestration notes
- Blocked awaiting user acceptance of ADR-004; on acceptance the main session must sync
  .claude/rules/tech-stack.md OCR row, close OI-01 in 11-assumptions-constraints.md +
  13-revision-history.md entry, and update the decisions README status. Task acceptance
  criterion "ADR-004 Accepted" deliberately downgraded to "Proposed" by mission brief -
  user is the accepter.

## Test scenarios / acceptance
- [ ] ADR-004 exists with status Accepted; tech-stack.md updated in the same PR.

## Session log (AI session log)

| Date | Who | What was done | Result |
|------|-----|---------------|--------|
| 2026-07-09 | orchestrator | Task created and registered in master-plan (bootstrap seed) | Planned |
| 2026-07-09 | orchestrator | docs/adr-004-ocr-engine branch created; dispatched tech-researcher for OCR evidence (spec inputs OI-01, NFR budgets) | Active |
| 2026-07-09 | tech-researcher | Evidence gathered on 4 candidates: WMO language matrix (no vi, packs absent by default), Tesseract low-DPI/vi-diacritic/binding issues, PaddleOCR PP-OCRv5 language coverage + oar-ocr/ort crate health + model sizes, cloud OCR privacy conflict; citations dated 2026-07-09 | Done |
| 2026-07-09 | brainstormer | Trade-off matrix across WMO / Tesseract / PaddleOCR / cloud / hybrid; recommendation: PP-OCRv5 mobile via oar-ocr 0.8.0 + ort 2.0.0-rc.12, conditional on a latency criterion spike as TASK-007's first gate; residual risks R1-R8 + escalation ladder defined | Done |
| 2026-07-09 | ba-analyst | ADR-004 drafted (ADR-004-paddleocr-onnx-ocr.md, status Proposed) with rationale, options, risk/validation table, revisit triggers; decisions README row added as Proposed | Blocked awaiting user acceptance |

## Result
<Fill when moving to Done.>
