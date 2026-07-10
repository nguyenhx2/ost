---
title: "TASK-011: Opt-in cloud OCR backends (BR-09)"
status: Pending
fr: "FR-02"
owner: screen-translate-dev
deps: "TASK-007"
priority: P1
phase: 1
created: 2026-07-10
tags: [task]
---

<!-- TASK FILES ARE WRITTEN 100% IN ENGLISH (see .claude/rules/task-tracking.md). -->

# TASK-011: Opt-in cloud OCR backends (BR-09)

## Goal
Add opt-in, owner-authorized cloud OCR backends behind the `OcrEngine` trait implementing BR-09 egress controls in full - default off, consented, minimal-crop-only egress.

## Inputs / context
- Related FR: [FR-02](../../specs/05-functional-requirements.md#fr-02); AC-02.5, AC-02.6.
- Related BR: BR-09 (opt-in cloud OCR).
- Related files: `src-tauri/src/ocr/` (new cloud backend behind `OcrEngine`), reuse the `src-tauri/src/models/` consent patterns, output-surface UI in `src/`.
- This is an EGRESS path: security-reviewer is MANDATORY before merge.
- This is NOT the Vietnamese-recognition remedy - it shares the consent mechanism but is a separate concern; do not conflate.

## To do
- [ ] Default-OFF: no cloud OCR call path is active until the user opts in per backend.
- [ ] Per-backend informed consent naming exactly what leaves, where it goes, and the provider stated retention or training policy (reuse the models/ consent facility patterns).
- [ ] Only a DOWNSCALED, metadata-stripped crop of the SELECTED region ever leaves - never the full screen, never disk (AC-02.5).
- [ ] Consent revocable in Settings; a visible active-backend indicator on the output surface.
- [ ] AC-02.6 (v1.2): every cloud backend declares per-source-language `OcrFidelity` (`Full`/`Degraded{reason}`) via the trait; backends without per-line scores show the standing unverified-recognition banner; PerLine-capable cloud backends (e.g. Google Vision, Azure Read) run the calibrated OI-07 threshold path, not just the banner.
- [ ] Gemini free-tier per BR-09: hard-block where detectable, OR require an affirmative training-risk acknowledgment where the tier is not detectable (do not drop the acknowledgment fallback).
- [ ] Egress hardening (parity with TASK-010): TLS enforced, request timeouts, bounded response payload, no key echoed in errors.
- [x] OPEN DECISION - RESOLVED by the owner on 2026-07-10: **park this task until after the MVP.**
      The conflict was real. FR-02 requires region p95 < 2s (AC-02.2/AC-02.4, NFR-PERF-02,
      BR-04). Local OCR measures p95 277ms, leaving room for the single LLM translate
      round-trip. A cloud OCR backend inserts a SECOND, serial network round-trip before
      translation can even begin, and nothing in the spec budget accommodates that.
      The owner chose to keep the task parked rather than relax the budget or open the
      egress path: the local OCR path already meets EN/JA at 1.000 accuracy and is not on
      the critical path for any user need. No spec amendment was made. BR-09 and the
      amended BR-01/NFR-SEC-03 remain in force and still authorize cloud OCR in principle -
      only the implementation is deferred.
      Unpark trigger: a real user need for a cloud backend, OR a measured spike showing the
      cloud OCR + translate chain fits inside 2s, OR an owner-signed relaxation of AC-02.2
      for the opt-in cloud path. Do NOT start implementation before one of those.
- [ ] Tests + audit proving only the reduced crop egresses and nothing hits disk.

## Test scenarios / acceptance
- [ ] AC-02.5 (cloud path): only the downscaled metadata-stripped crop leaves; the full screen never; nothing to disk.
- [ ] AC-02.6: a no-confidence backend shows the standing banner.
- [ ] BR-09 satisfied end to end; consent revocable; active-backend indicator visible.
- [ ] Every cloud backend declares fidelity (AC-02.6); PerLine-capable backends use the OI-07 threshold.
- [ ] Region-translate latency: cloud path meets p95 < 2s OR the owner-approved relaxation is recorded (AC-02.2/02.4, BR-04).
- [ ] security-reviewer PASS on the egress path (MANDATORY).

## Orchestration notes
- Owner-authorized. security-reviewer MANDATORY - egress. Reuse the shared model-consent patterns.
- Separate from the vi-capable rec-model remedy.
- spec-guardian 2026-07-10: 4 gaps folded in (p95<2s budget as an owner decision, AC-02.6 fidelity+PerLine, BR-09 free-tier acknowledgment fallback, egress hardening). The p95<2s question is an owner escalation BEFORE this task is dispatched.

## Session log (AI session log)

| Date | Who | What was done | Result |
|------|-----|---------------|--------|
| 2026-07-10 | orchestrator | Task created and registered in master-plan (Phase B decomposition) | Planned |
| 2026-07-10 | spec-guardian | Pre-dispatch scope check vs FR-02 AC-02.5/02.6(v1.2)/BR-09. GAPS folded in: p95<2s budget (owner escalation), fidelity+PerLine per AC-02.6, BR-09 free-tier acknowledgment fallback, egress hardening. | Blocked on owner budget decision before dispatch |
| 2026-07-10 | orchestrator | PARKED to pending/. Owner decision outstanding: a cloud OCR round-trip stacked on the LLM translate call plausibly cannot meet the FR-02 region p95 < 2s budget (NFR-PERF-02/AC-02.2/BR-04; local OCR alone is ~277ms). Budget-vs-budget conflict is an owner call. No cloud OCR code, dependency, or egress path until the owner rules; local OCR already works so nothing is blocked. | Pending |

## Result
<Fill when moving to Done; link the PR/commit. Then move the file to docs/tasks/done/.>
