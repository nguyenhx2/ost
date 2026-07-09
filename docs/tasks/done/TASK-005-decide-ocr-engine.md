---
title: "TASK-005: Decide the OCR engine (/brainstorm -> ADR)"
status: Done
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
- [x] OWNER authorized (2026-07-09) the 7 cloud preconditions + the requirement
      amendments (BR-01, NFR-SEC-03, AC-02.5, AC-02.6/OI-07, NFR-REL-03, new BR-09).
- [x] Amendments applied + 13-revision-history 1.1 row added + OI-01 closed + PRD-FR-02
      synced (branch docs/accept-adr-004). NOTE: .claude/rules/tech-stack.md OCR row still
      reads 'OPEN DECISION' - deferred; a rule-file edit was NOT in this mission's scope.

## Orchestration notes
- RE-SCOPE (2026-07-09): owner clarified OCR SOURCE content is EN + JA at HIGHEST volume
  (game subtitles, app chrome, low-DPI UI), so EN + JA carry the most weight for recognition
  QUALITY. OWNER COVERAGE CORRECTION (2026-07-09): Vietnamese is NOT dropped - PP-OCRv5 keeps
  FULL coverage including vi, and language coverage breadth (with Vietnamese REQUIRED) is a
  distinct, first-class evaluation criterion, not weight to trim. The decision was RE-DERIVED
  (not carried forward): local PaddleOCR PP-OCRv5 mobile remains the default because Japanese
  is first-class in the single main rec model on any machine, it has the broadest local
  coverage (en/ja/zh/ko/vi - the only local engine covering Vietnamese; full-coverage bundle
  ~40MB first-run download, ACCEPTABLE, whisper-style), and it provides native per-line
  confidence (AC-02.6). Windows.Media.Ocr was re-evaluated fairly and NOT chosen as sole
  default on TWO gaps - no Vietnamese across its ~25 OCR languages (coverage deficiency) AND
  the AC-02.6 confidence gap (legacy OcrWord = Text+BoundingRect only, no confidence; the
  confidence-capable Windows AI TextRecognizer is NPU-only + not in the `windows` crate); WMO
  retained as R2 fallback + opt-in fast-EN/JA backend. Hybrid (WMO fast en/ja + Paddle broad
  coverage) deferred - single Paddle default is simpler (WMO has no confidence to route on and
  lacks vi). Azure Read is now ELIGIBLE as an optional cloud backend (en+ja supported; the old
  Vietnamese disqualification is void). Spike/fixtures KEEP Vietnamese (secondary, alongside
  EN+JA primary and ko/zh) and ADD JA-vertical accuracy + WMO ja-pack/latency probe.
- TASK-005 REMAINS BLOCKED pending owner sign-off. Two decisions are now separable:
  (1) the LOCAL default (PaddleOCR PP-OCRv5 via oar-ocr) needs no requirement change and is
  ready to proceed on the R1 latency spike; (2) any OPTIONAL CLOUD backend (Google Vision +
  Azure Read - both en+ja eligible; multimodal-LLM secondary/experimental) is a REQUIREMENT
  CHANGE (the screenshot crop leaves the machine, touching NFR-SEC-03 / BR-01 / AC-02.5) that
  ONLY THE OWNER can authorize.
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
- [x] ADR-004 status Accepted (deciders: [nguyenhx2]). NOTE: tech-stack.md OCR row sync deferred (rule-file, out of mission scope) - flagged for a separate owner-authorized change.

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
| 2026-07-09 | tech-researcher | RE-SCOPE evidence (EN+JA source): two on-device MS OCR stacks distinguished - legacy Windows.Media.Ocr (en+ja, on-device, NO confidence via OcrWord) vs Windows AI TextRecognizer (has confidence, NPU-only, not in `windows` crate). PP-OCRv5 mobile: JA first-class in single main rec model, EN+JA bundle ~20MB (vi/latin 7.7MB dropped), line-strict EN 0.8753 / JA 0.7577, per-line confidence, <=700ms unproven. Tesseract jpn/jpn_vert rejected (low-DPI + PSM fragility). Azure Read NOW ELIGIBLE (en+ja print+handwrite, no-train+delete, word confidence). Still-open spike items: JA-vertical accuracy, small-crop p95, ja-JP pack presence on stock Win11 | Done |
| 2026-07-09 | brainstormer | RE-DERIVED recommendation under EN+JA framing (not carry-forward): default = local PaddleOCR PP-OCRv5 mobile (in-model JA guarantee + native per-line confidence), spike-gated on R1 <=700ms; WMO fairly re-evaluated, not sole default on the AC-02.6 confidence gap, retained as R2 + opt-in fast-EN; hybrid deferred (WMO has no confidence to route on); Azure Read added as eligible optional cloud; fallback ladder + spike additions (JA-vertical, WMO pack/latency probe, drop vi fixtures) defined | Done |
| 2026-07-09 | ba-analyst | Rewrote ADR-004 AGAIN under EN+JA re-scope (status still Proposed): removed all Vietnamese-source framing/rationale; JA-first rationale (in-model JA + per-line confidence + ONNX Phase-4); WMO row -> strong candidate/not-default-on-AC-02.6/R2+opt-in with legacy-vs-App-SDK stack distinction; Azure row DISQUALIFIED -> eligible optional cloud; bundle ~20MB; spike drops vi + adds JA-vertical + WMO pack/latency probe (R5/R9); kept confidence abstraction + consent + data-min + Gemini block + owner-decision package + proposed amendments (a-f) as DRAFTS not applied. AC numbers verified against live spec: AC-02.5 = image egress, AC-02.6 = confidence | Blocked awaiting owner sign-off |
| 2026-07-09 | ba-analyst | Applied OWNER COVERAGE CORRECTION to ADR-004 (status still Proposed, decision unchanged): Vietnamese is NOT dropped and coverage breadth (vi REQUIRED) is now an explicit first-class evaluation criterion. Reversed the "drop vi / shrink to ~20MB" framing -> full-coverage ~40MB bundle presented as ACCEPTABLE (whisper first-run precedent AC-01.8/NFR-REL-04); added coverage criterion to Context forces + rationale scoring point #2 + stated the 6-item scoring weight order (EN/JA quality > coverage breadth > latency > setup > privacy > Phase-4); re-scored WMO with a coverage deficiency (no vi across ~25 langs) IN ADDITION TO the AC-02.6 gap; scored the hybrid explicitly (single Paddle default preferred); kept vi in the spike fixtures. Owner-decision package + proposed amendments (a-f) untouched | Blocked awaiting owner sign-off |
| 2026-07-09 | orchestrator | Owner signed off both Stream C decisions. Applied ADR-004 amendments (BR-01, NFR-SEC-03, NFR-REL-03, AC-02.5, AC-02.6/OI-07; added BR-09; resolved OI-01; synced PRD-FR-02); flipped ADR-004 Proposed -> Accepted; recorded WMO-fallback known issue | Done |

## Result
ADR-004 (pluggable OCR backends) ACCEPTED by the owner on 2026-07-09 (deciders: [nguyenhx2]). Decision: local PaddleOCR PP-OCRv5 via oar-ocr 0.8.0 + ort 2.0.0-rc.12 behind the `OcrEngine` trait is the DEFAULT and offline fallback, spike-gated on the R1 OCR latency criterion (<= 700ms p95) as TASK-007's first gate. Owner also authorized the 7 cloud preconditions and opt-in off-machine OCR backends (Google Cloud Vision, Azure AI Vision Read, multimodal-LLM), all default-OFF behind per-backend informed consent (BR-09), data minimization (crop-only, downscaled, metadata-stripped, in-memory), Gemini free-tier block, confidence-source abstraction, and an active-backend indicator.

Requirement amendments applied on branch docs/accept-adr-004: BR-01 amended and BR-09 added (business-rules.md); NFR-SEC-03 and NFR-REL-03 amended (07-nfr); AC-02.5 and AC-02.6 amended (05-fr); OI-01 resolved and OI-07 extended (11-assumptions); revision-history 1.1 row added (13); PRD-FR-02 synced. ADR status flipped Proposed -> Accepted. Known-issue recorded for the WMO R2-fallback Vietnamese-coverage residual. Cloud backends are NOT built here; they are sequenced after the local engine is proven, each with a security-reviewer pass on the image-egress path.

Follow-up flagged: .claude/rules/tech-stack.md OCR row still reads 'OPEN DECISION' - a rule-file edit not authorized in this mission; needs a separate owner-approved sync.

PR: opened from docs/accept-adr-004 to main (2026-07-09). This file is being moved to docs/tasks/done/ by the orchestrator.
