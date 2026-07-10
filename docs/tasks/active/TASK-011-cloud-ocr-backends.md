---
title: "TASK-011: Opt-in cloud OCR backends (BR-09)"
status: Planned
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
- [ ] Confidence `Unavailable` for backends with no per-line scores -> standing unverified-recognition banner (AC-02.6).
- [ ] Block the Gemini free-tier for this egress (free-tier data-use policy).
- [ ] Tests + audit proving only the reduced crop egresses and nothing hits disk.

## Test scenarios / acceptance
- [ ] AC-02.5 (cloud path): only the downscaled metadata-stripped crop leaves; the full screen never; nothing to disk.
- [ ] AC-02.6: a no-confidence backend shows the standing banner.
- [ ] BR-09 satisfied end to end; consent revocable; active-backend indicator visible.
- [ ] security-reviewer PASS on the egress path (MANDATORY).

## Orchestration notes
- Owner-authorized. security-reviewer MANDATORY - egress. Reuse the shared model-consent patterns.
- Separate from the vi-capable rec-model remedy.

## Session log (AI session log)

| Date | Who | What was done | Result |
|------|-----|---------------|--------|
| 2026-07-10 | orchestrator | Task created and registered in master-plan (Phase B decomposition) | Planned |

## Result
<Fill when moving to Done; link the PR/commit. Then move the file to docs/tasks/done/.>
