---
title: "TASK-017: Global hotkeys + tray UX"
status: Planned
fr: "FR-04"
owner: frontend-ui-dev
deps: "TASK-016"
priority: P0
phase: 3
created: 2026-07-10
tags: [task]
---

<!-- TASK FILES ARE WRITTEN 100% IN ENGLISH (see .claude/rules/task-tracking.md). -->

# TASK-017: Global hotkeys + tray UX

## Goal
Give the app full background control via global hotkeys and a system tray menu, with close-to-tray.

## Inputs / context
- Related FR: [FR-04](../../specs/05-functional-requirements.md#fr-04); OI-04 default hotkey set.
- Related files: `src-tauri/src/shell/` (tray, hotkeys), `src/` settings.

## To do
- [ ] Global hotkeys (start/stop audio, activate region select, show/hide overlay) working when another app is focused; reconfigurable in Settings (AC-04.1).
- [ ] Tray icon always present; menu: start/stop audio, region select, Settings, History, quit; close-to-tray not exit (AC-04.2).

## Test scenarios / acceptance
- [ ] AC-04.1 hotkeys + reconfig; AC-04.2 tray menu + close-to-tray.

## Orchestration notes
- Phase 3 background UX.

## Session log (AI session log)

| Date | Who | What was done | Result |
|------|-----|---------------|--------|
| 2026-07-10 | orchestrator | Task created and registered in master-plan (Phase B decomposition) | Planned |

## Result
<Fill when moving to Done; link the PR/commit. Then move the file to docs/tasks/done/.>
