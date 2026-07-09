---
title: "TASK-005: Decide the OCR engine (/brainstorm -> ADR)"
status: Planned
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
- [ ] `/brainstorm ocr engine for region translate` with trade-off matrix.
- [ ] `/new-adr` with the outcome; user accepts.
- [ ] Update tech-stack.md OCR row and the decisions README index.

## Test scenarios / acceptance
- [ ] ADR-004 exists with status Accepted; tech-stack.md updated in the same PR.

## Session log (AI session log)

| Date | Who | What was done | Result |
|------|-----|---------------|--------|
| 2026-07-09 | orchestrator | Task created and registered in master-plan (bootstrap seed) | Planned |

## Result
<Fill when moving to Done.>
