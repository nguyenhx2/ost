---
title: "TASK-027: Generalize the deferred window-open helper across all five window sites"
status: Active
fr: FR-04
owner: frontend-ui-dev
deps: TASK-023
priority: P0
phase: 1
created: 2026-07-11
tags: [task]
---

<!-- TASK FILES ARE WRITTEN 100% IN ENGLISH (see .claude/rules/task-tracking.md). -->

# TASK-027: Generalize the deferred window-open helper across all five window sites

## Goal
Generalize the deferred window-open helper created in TASK-023 to all five window sites in the shell, eliminating the risk of WebView2 window-lifecycle deadlock when window-creation is triggered from inside a WebView IPC callback.

## Inputs / context
- Related FR: [FR-04](../../specs/05-functional-requirements.md#fr-04)
- Related TASK: TASK-023 (fixed the reentrant deadlock for region-preview only)
- Related files/modules:
  - `src-tauri/src/shell/caption.rs:78`
  - `src-tauri/src/shell/history.rs:31`
  - `src-tauri/src/shell/settings.rs:29`
  - `src-tauri/src/shell/region.rs:557` (selection overlay)
  - `src-tauri/src/shell/region.rs:589` (preview)

## Problem
TASK-023 fixed the reentrant WebView2 window-lifecycle deadlock ONLY for the region-preview path. Every other window-creating site still calls `WebviewWindowBuilder::build()` inline, so any of them deadlocks when invoked from inside a WebView IPC callback (where `webview2_com::wait_with_pump` reenters the `WebviewWrapper` mutex). Owner-confirmed repro: clicking "Start audio session" inside the Settings window hangs the app hard; the same action from the global hotkey (Ctrl+Alt+A) works, because it runs on the event loop instead of inside a WebView IPC callback.

## To do
- [ ] Create a shared deferred window-open helper (e.g. `shell::windows::open_deferred`) that never builds a webview inline on the calling turn
- [ ] Route all five window-creation sites through the helper
- [ ] Add a static guard test/check that fails when a raw `WebviewWindowBuilder::...build()` appears outside the helper
- [ ] Add e2e tests that drive window-opening from a WebView context for caption, settings, and history (not just region)
- [ ] Verify the fix with cdb thread dump on the RELEASE binary: before shows deadlock frames; after shows thread 0 idle (e.g. `NtUserGetMessage`) with none of those frames

## Test scenarios / acceptance
- [ ] One shared helper (e.g. `shell::windows::open_deferred`) exists and is used by all five window-creating sites
- [ ] No raw `WebviewWindowBuilder::...build()` exists outside the helper (guard test enforces this)
- [ ] E2E test drives window-opening from a WebView context for caption, settings, and history
- [ ] RELEASE binary thread dump before the fix shows the deadlock frames
- [ ] RELEASE binary thread dump after the fix shows thread 0 idle with none of those deadlock frames

## Orchestration notes
- This is a critical fix to prevent app hangs when the user interacts with settings/history/caption windows via WebView callbacks.
- The fix should be generic so it works across all window types.
- Performance implication: use task scheduling (not blocking event loop) to defer window creation.

## Session log (AI session log)

| Date | Who | What was done | Result |
|------|-----|---------------|--------|
| 2026-07-11 | orchestrator | Task registered from owner hands-on session mission brief | Registered |

## Result
<Fill when moving to Done; link the PR/commit. Then move the file to docs/tasks/done/.>
