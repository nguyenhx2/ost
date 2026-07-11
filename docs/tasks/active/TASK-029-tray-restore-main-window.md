---
title: "TASK-029: Tray item + left-click to restore the main window"
status: Blocked
fr: FR-04
owner: frontend-ui-dev
deps: TASK-027
priority: P1
phase: 3
created: 2026-07-11
tags: [task]
---

<!-- TASK FILES ARE WRITTEN 100% IN ENGLISH (see .claude/rules/task-tracking.md). -->

# TASK-029: Tray item + left-click to restore the main window

## Goal
Add a tray menu item and left-click affordance to restore and focus the main window when it is closed to tray.

## Inputs / context
- Related FR: [FR-04](../../specs/05-functional-requirements.md#fr-04)
- Related TASK: TASK-027 (deferred window-open helper - required for implementation)
- Related files/modules:
  - `src-tauri/src/shell/tray.rs`
  - `src-tauri/src/shell/mod.rs` (CLOSE_TO_TRAY_LABELS handling)

## Problem
Once the main window is closed there is no way to reopen it. The tray menu has audio start/stop, region select, settings, history, quit - but no "show main window", and left-clicking the tray icon only opens the menu (`show_menu_on_left_click(true)` in `src-tauri/src/shell/tray.rs`).

## To do
- [x] Add a tray menu item (Vietnamese-first label, consistent with existing tray copy) that shows and focuses the main window
- [x] Configure left-click on the tray icon to show and focus the main window
- [x] Ensure closing the main window hides it to tray rather than destroying it (verify existing `CLOSE_TO_TRAY_LABELS` handling)
- [x] Route reopening through the TASK-027 deferred window helper - no inline `WebviewWindowBuilder::build()`
- [ ] Add e2e test that closes the main window, verifies it is hidden, then clicks the tray to restore it (not feasible: WebDriver/tauri-driver attaches to a WebView, not the native tray icon/menu - covered instead by exhaustive unit tests of the pure id/click -> action mapping plus manual release-binary verification, see session log)

## Test scenarios / acceptance
- [x] Tray menu item exists with a Vietnamese-first label consistent with the existing tray copy
- [x] Left-clicking the tray icon shows and focuses the main window
- [x] Closing the main window hides it to tray (does not destroy it)
- [x] Reopening the main window uses the TASK-027 deferred window helper (no inline `WebviewWindowBuilder::build()`)
- [ ] E2E test passes: close main window -> verify hidden -> click tray -> verify restored and focused (see note above; verified manually against the release binary instead)

## Orchestration notes
- BLOCKED: sequenced behind TASK-027 because both edit `src-tauri/src/shell/`; reopening the main window must go through TASK-027's deferred window helper to avoid deadlock.
- This task depends on TASK-027 being complete and merged.
- Use the TASK-027 helper to ensure the main window respects the deferred window-open pattern.

## Session log (AI session log)

| Date | Who | What was done | Result |
|------|-----|---------------|--------|
| 2026-07-11 | orchestrator | Task registered from owner hands-on session mission brief | Registered |
| 2026-07-11 | frontend-ui-dev | Added `MENU_ID_SHOW_WINDOW` ("Hiện cửa sổ chính", placed first in the menu) and a new `shell::main_window::restore_main_window` helper routed through `windows::open_deferred` (`Existing::ShowAndFocus`); refactored `tray.rs` so menu-id and icon-click dispatch both resolve through a pure `TrayAction` mapping (unit-tested, 7 new tests); wired `on_tray_icon_event` for a left-click(release)-only restore and set `show_menu_on_left_click(false)` (native right-click menu is unaffected by that flag). `cargo fmt`/`clippy -D warnings`/`cargo test --lib` clean (incl. the TASK-027 `no_raw_webview_window_builder_outside_this_module` guard). Verified against the release binary (`npm run tauri build -- --no-bundle`): WM_CLOSE on the main window hides it while the process stays alive; a real OS-level click on the tray icon (via Shell_NotifyIconGetRect + SendInput, since this box has an actual interactive desktop) shows AND foregrounds the main window (`GetForegroundWindow` == main hwnd, title "OST"); a right-click on the icon still opens the native `#32768` context-menu window (menu stays reachable). No e2e spec added (tauri-driver cannot drive the native tray/menu) and `window-open-deferred.spec.ts` left untouched. | Done - PR opened |

## Result
<Fill when moving to Done; link the PR/commit. Then move the file to docs/tasks/done/.>
