---
title: "TASK-016: Caption overlay UI (bilingual subtitles)"
status: Planned
fr: "FR-01, FR-04"
owner: frontend-ui-dev
deps: "TASK-015, TASK-008"
priority: P0
phase: 2
created: 2026-07-10
tags: [task]
---

<!-- TASK FILES ARE WRITTEN 100% IN ENGLISH (see .claude/rules/task-tracking.md). -->

# TASK-016: Caption overlay UI (bilingual subtitles)

## Goal
Render the live bilingual caption overlay with a provider/model badge, low-confidence flagging and keyboard-operable controls.

## Inputs / context
- Related FR: [FR-01](../../specs/05-functional-requirements.md#fr-01), FR-04; SCR-01.
- Related files: `src/` overlay window, `src-tauri/src/shell/` window management.
- human-in-the-loop.md: AI output is a proposal; low-confidence flagged; provider transparency.

## To do
- [ ] Always-on-top caption overlay: source + translated text, legible over any background (token scrim, user opacity).
- [ ] Provider/model badge always visible; switch is one interaction away (AC-03.5).
- [ ] Low-confidence STT segments visibly flagged (AC-01.7).
- [ ] pin/copy/dismiss/drag/opacity, all keyboard-operable (AC-04.3, AC-04.8).
- [ ] Primitives + tokens only; i18n vi+en; WCAG AA; Vitest.

## Test scenarios / acceptance
- [ ] AC-01.1 overlay appears on session start; AC-01.7 low-confidence flag; AC-03.5 provider badge; AC-04.3 keyboard controls.
- [ ] Design-system hard gate holds; no emoji; lucide icons.

## Orchestration notes
- Consumes the caption event from TASK-015.

## Session log (AI session log)

| Date | Who | What was done | Result |
|------|-----|---------------|--------|
| 2026-07-10 | orchestrator | Task created and registered in master-plan (Phase B decomposition) | Planned |

## Result
<Fill when moving to Done; link the PR/commit. Then move the file to docs/tasks/done/.>
