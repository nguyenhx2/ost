---
title: "TASK-003: Write full 13-section specs for FR-01..FR-05 (spec-builder)"
status: Done
fr: "FR-01..FR-05"
owner: ba-analyst
deps: "-"
priority: P0
phase: 0
created: 2026-07-09
tags: [task]
---

# TASK-003: Write full 13-section specs for FR-01..FR-05 (spec-builder)

## Goal
docs/specs/ contains the full 13-section BA analysis detailing the five seed FRs with
acceptance criteria, so implementation tasks have a locked contract.

## Inputs / context
- Seed FR table in `docs/specs/README.md`; performance budgets in
  `.claude/rules/tech-stack.md` (they are NFRs); ADR-001..003 constrain the solution space.
- Run the `spec-builder` skill - never hand-invent the 13 sections.

## To do
- [x] Run spec-builder with the seed FRs and intake decisions as input.
- [x] Acceptance criteria per FR are observable/testable (latency numbers included).
- [x] Create PRD-FR-02 (Phase 1 target) from the PRD template.

## Test scenarios / acceptance
- [x] `docs/specs/05-functional-requirements.md` defines FR-01..FR-05 with numbered
      acceptance criteria; revision history initialized.
- [x] spec-guardian can restate a locked contract for FR-02 from the docs alone.

## Session log (AI session log)

| Date | Who | What was done | Result |
|------|-----|---------------|--------|
| 2026-07-09 | orchestrator | Task created and registered in master-plan (bootstrap seed) | Planned |
| 2026-07-09 | orchestrator | Dispatched: running spec-builder in main session (parallel with TASK-002 scaffold) | Active |
| 2026-07-09 | orchestrator | Per user request, handed the mission off to an independent orchestrator instance in an isolated worktree (branch docs/specs-fr-01-05); product decisions (language auto+pin, history on-by-default local, hardware-suggested whisper model) passed in the brief | Handed off |
| 2026-07-09 | orchestrator | Mission running in isolated worktree (branch docs/specs-fr-01-05); dispatched ba-analyst: spec-builder 13 sections, PRD-FR-02 stub, BR-06, glossary sync | Active |
| 2026-07-09 | ba-analyst | Wrote full 13-section spec set in docs/specs/ (FR-01..FR-05 with numbered ACs incl. latency budgets, UC-01..06, US-01..13, traceability, NFRs, ER model, feasibility, revision history v1.0); created PRD-FR-02 stub + requirements index row; appended BR-06..BR-08; extended domain glossary; open issues OI-01..OI-07 recorded | 13 spec files + PRD delivered; quality gate self-checked |
| 2026-07-09 | orchestrator | Verified deliverables against worktree: 14 spec files + PRD with frontmatter, all links/anchors resolve, latency ACs numeric, FR coverage in feasibility, BR-06..08 present, no emoji/em dash; dispatched spec-guardian | Verification passed |
| 2026-07-09 | spec-guardian | Audited specs vs seed FR table, ADR-001..003, 3 product decisions, invariants; restated FR-02 contract from docs alone | PASS - no drift, no ADR contradiction; 6 non-blocking nits + 6 derived quantifications flagged for owner sign-off |
| 2026-07-09 | ba-analyst | Applied 5 spec-guardian polish fixes: FR-02.8 priority Should->Must (PRD), AC-04.7 UI-language default follows OS + ui_language "system" default in data model, AC-04.4 field list aligned with HISTORY_ENTRY dictionary, WHISPER_MODEL model_id loosened to string with examples, AC-02.1 explicit confirm gesture (mouse release/Enter, Esc cancels) matching SCR-02 | All 5 fixes applied within v1.0 (no new revision row); acceptance checkboxes ticked |
| 2026-07-09 | orchestrator | Verified all 5 polish fixes in files; links/anchors re-checked clean, no em dash/emoji, no out-of-scope changes; committing spec set on branch docs/specs-fr-01-05 | Ready for merge gates by main session |

## Result
Delivered on branch `docs/specs-fr-01-05` (commits 1317681 + f563476), merged to main in
fdc3306 by the main session after conflict resolution on this task file. Full 13-section
spec set in docs/specs/ (Vietnamese prose, English IDs): FR-01..FR-05 with numbered
testable ACs including latency budgets, UC-01..06, US-01..13, SCR-01..08, NFRs, ER model +
data dictionary, feasibility, revision history v1.0. Plus PRD-FR-02 stub, BR-06..BR-08,
glossary sync. spec-guardian verdict: PASS (no drift, no ADR contradiction). Follow-ups:
(1) owner sign-off requested on 6 BA-derived quantifications (AC-01.10 stop <= 1s,
AC-05.4 idle within 60s, NFR-PERF-03 5-min idle average, AC-01.2 >= 10-min benchmark,
AC-02.4 p95 < 2s on live updates, AC-04.1 three default hotkey actions); (2) open issues
OI-01..OI-07 recorded in 11-assumptions-constraints.md; (3) security-privacy.md synced to
BR-06 in the close-out commit.
