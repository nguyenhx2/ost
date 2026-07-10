---
title: "TASK-018: Translation history (BR-06)"
status: Planned
fr: "FR-04"
owner: frontend-ui-dev
deps: "TASK-009"
priority: P1
phase: 3
created: 2026-07-10
tags: [task]
---

<!-- TASK FILES ARE WRITTEN 100% IN ENGLISH (see .claude/rules/task-tracking.md). -->

# TASK-018: Translation history (BR-06)

## Goal
Store completed translations text-only and local, on by default, with a visible clear-all, a disable toggle and a history view.

## Inputs / context
- Related FR: [FR-04](../../specs/05-functional-requirements.md#fr-04); BR-06; the HISTORY_ENTRY data dictionary.
- Related files: `src/` history view, the history store (text-only), `src-tauri/src/commands/`.

## To do
- [ ] History store: text-only fields per HISTORY_ENTRY (source/translated text, langs, provider/model, session type, timestamp) - NEVER keys, audio, or screenshots (AC-04.4).
- [ ] ON by default (BR-06); a history view lists entries with copy.
- [ ] Clear-all control always visible, with confirm, wipes the store (AC-04.5).
- [ ] Disable toggle in Settings stops recording; re-enable resumes (AC-04.6); i18n; Vitest.

## Test scenarios / acceptance
- [ ] AC-04.4 text-only fields, no key/audio/screenshot; AC-04.5 clear-all; AC-04.6 disable toggle.
- [ ] security-reviewer confirms no sensitive data in the store.

## Orchestration notes
- BR-06 on by default (owner decision 2026-07-09).

## Session log (AI session log)

| Date | Who | What was done | Result |
|------|-----|---------------|--------|
| 2026-07-10 | orchestrator | Task created and registered in master-plan (Phase B decomposition) | Planned |

## Result
<Fill when moving to Done; link the PR/commit. Then move the file to docs/tasks/done/.>
