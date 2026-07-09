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
- [x] Owner reviewed the first draft and REOPENED the task (2026-07-09): wants a
      user-switchable/pluggable OCR backend and cloud OCR evaluated (Google Cloud Vision).
- [x] ADR-004 rewritten as "local default + pluggable optional cloud backends behind
      informed consent" with an owner-decision package + proposed requirement amendments
      (status still Proposed). File renamed to ADR-004-pluggable-ocr-backends.md; README
      index + old-filename pointer updated.
- [ ] OWNER decides: authorize (or not) the 7 cloud preconditions + the requirement
      amendments (BR-01, NFR-SEC-03, AC-02.5, AC-02.6/OI-07, NFR-REL-03, new BR-09).
- [ ] On sign-off: ba-analyst applies the amendments + adds the 13-revision-history row;
      main session syncs .claude/rules/tech-stack.md OCR row and closes OI-01. Local
      default can proceed on the R1 spike regardless of the cloud decision.

## Orchestration notes
- TASK-005 REMAINS BLOCKED pending owner sign-off. Two decisions are now separable:
  (1) the LOCAL default (PaddleOCR PP-OCRv5 via oar-ocr) needs no requirement change and is
  ready to proceed on the R1 latency spike; (2) any OPTIONAL CLOUD backend (Google Vision
  first; multimodal-LLM secondary/experimental; Azure disqualified - no Vietnamese) is a
  REQUIREMENT CHANGE (the screenshot crop leaves the machine, touching NFR-SEC-03 / BR-01 /
  AC-02.5) that ONLY THE OWNER can authorize.
- Do NOT flip status to Done and do NOT add any cloud-OCR dependency or code. TASK-007 stays
  Planned/blocked; when unblocked it ships LOCAL-ONLY first (R1 spike as its first gate);
  cloud backends are sequenced AFTER local is proven, each with a security-reviewer pass on
  the image-egress path.
- The ADR keeps status Proposed by design: the protect-adr hook makes Accepted ADRs
  immutable and only the owner accepts. The owner-decision package (7 preconditions) and the
  proposed amendments (a-f) live inside ADR-004; nothing in the live specs / business-rules
  was modified.
- Reconciliation note for the owner: the live FR-02 image-egress acceptance criterion is
  AC-02.5 (not AC-02.6 as the prior agents referenced from ADR-quoted text). AC-02.6 is the
  confidence-flag criterion. Both are addressed in the proposed amendments; live wording was
  re-read from docs/specs/05 and 07 on 2026-07-09 before drafting.

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
| 2026-07-09 | owner | Reviewed first ADR-004 draft; did NOT accept. Requested (1) user-switchable/pluggable OCR backend easy to set up and switch, (2) cloud OCR evaluated (Google Cloud Vision specifically, owner can supply a key). Task REOPENED | Reopened |
| 2026-07-09 | tech-researcher | Verified cloud/LLM paths all send the crop off-machine. Google Vision: best cloud privacy (in-memory, no training, DPA), strong vi+CJK, per-word confidence, free <=1000/mo then ~$1.50/1k, new key. Azure: DISQUALIFIED (Vietnamese unsupported, diacritic failures). Multimodal-LLM (reuse FR-03): no new key/dep/download but no per-line confidence, verbatim risk, 1-4s latency, Gemini free-tier trains. Local PaddleOCR/oar-ocr claims re-verified. Open flag: no dated small-crop Vision latency benchmark | Done |
| 2026-07-09 | brainstormer | Designed local-default + pluggable optional cloud backends behind per-backend default-OFF informed consent: data minimization (crop only, downscale ~1568px, metadata strip, in-memory), Gemini free-tier block, confidence-source abstraction (PerLine vs Unavailable + standing banner), active-cloud indicator. Recommendation: default local, Google Vision first optional, multimodal-LLM secondary/experimental, no Azure; R1 local spike gate unchanged; cloud sequenced after local proven; security-reviewer per image-egress path | Done |
| 2026-07-09 | ba-analyst | Rewrote ADR-004 as "local default + pluggable optional cloud backends behind informed consent" (renamed ADR-004-pluggable-ocr-backends.md, status still Proposed): moved Google Vision to accepted-optional, kept Azure disqualified + Tesseract/WMO rejected, added consent gate + data-minimization + confidence abstraction + Gemini block + R9-R12, preserved R1 local spike. Added Owner-decision package (7 preconditions) + proposed requirement amendments (BR-01, NFR-SEC-03, AC-02.5, AC-02.6/OI-07, NFR-REL-03, new BR-09, revision-history row) drafted but NOT applied. README index + old-filename pointer updated | Blocked awaiting owner sign-off |

## Result
<Fill when moving to Done.>
