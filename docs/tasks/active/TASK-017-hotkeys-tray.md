---
title: "TASK-017: Global hotkeys + tray UX"
status: Active
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
- [x] Global hotkeys (start/stop audio, activate region select, show/hide overlay) working when another app is focused; reconfigurable in Settings (AC-04.1).
- [x] Tray icon always present; menu: start/stop audio, region select, Settings, History, quit; close-to-tray not exit (AC-04.2).
- [x] Add the HISTORY window: a `Lich su` tray menu item + `open_history` (index.html?view=history) mirroring settings/caption windows (deferred from TASK-018; the frontend `history` route already exists).
- [x] Wire `useHistory.refresh` (store-change/focus) so an already-open History window live-updates (TASK-018 code-reviewer follow-up).
- [x] Emit an `audio:stopped` (window-destroy) event so the Settings `useAudioSession` running state stays in sync when the caption overlay is closed directly (TASK-016 follow-up).
- [x] Wire the dead `caption.modelBlocked` i18n key into the caption overlay blocked banner (TASK-016 nit).

## Test scenarios / acceptance
- [x] AC-04.1 hotkeys reconfig (unit); AC-04.2 tray menu construction + close-to-tray logic (unit). Global-hotkey firing while another app is focused + live tray click are MANUAL/e2e (not unit-testable here).

## Orchestration notes
- 2026-07-10: absorbs the deferred FR-04 UI items - the History tray window + open_history_window (from TASK-018), useHistory.refresh live-update (TASK-018 review), and the audio:stopped/window-close sync + dead i18n key (TASK-016 review). Depends on TASK-016 (caption overlay + tray-reachable windows), now on main.
- Phase 3 background UX.

## Session log (AI session log)

| Date | Who | What was done | Result |
|------|-----|---------------|--------|
| 2026-07-10 | orchestrator | Task created and registered in master-plan (Phase B decomposition) | Planned |
| 2026-07-10 | frontend-ui-dev | Flip status Planned -> Active; begin hotkeys + tray + history-window work | Active |
| 2026-07-10 | frontend-ui-dev | Implemented configurable global hotkeys (plugin dynamic register/unregister, persisted in settings.json `hotkeys`, conflict rollback), full tray menu (audio start/stop, region, Settings, History, quit), close-to-tray via on_window_event, history window + open_history + capability, useHistory live-update (store-change + focus), audio:stopped sync in useAudioSession, wired caption.modelBlocked banner. Gates: tsc OK, vitest 228 pass, eslint+prettier clean, cargo fmt --check clean, clippy --all-targets -j2 -D warnings clean, cargo test shell::hotkeys 8 pass. | Active |

## Result
<Fill when moving to Done; link the PR/commit. Then move the file to docs/tasks/done/.>
