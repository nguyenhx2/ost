---
title: "TASK-023: Fix reentrant window-lifecycle deadlock (close-select + open-preview in one turn)"
status: Active
fr: "FR-02"
owner: frontend-ui-dev
deps: "TASK-021"
priority: P0
phase: 1
created: 2026-07-11
tags: [task]
---

<!-- TASK FILES ARE WRITTEN 100% IN ENGLISH (see .claude/rules/task-tracking.md). -->

# TASK-023: Fix reentrant window-lifecycle deadlock (close-select + open-preview in one turn)

## Goal
Selecting a region must not hang. The real hang is a REENTRANT WINDOW-LIFECYCLE DEADLOCK on the main thread (proven by a cdb thread dump), NOT screen capture. Fix the window transition so confirm-region never deadlocks.

## Inputs / context
- GROUND TRUTH: `src-tauri/target/release/hang-stacks.txt` (cdb `~*kn`). Main thread parked in `WebviewWrapper::drop -> Mutex::lock_contended`, reached via `NtUserDestroyWindow -> wry parent_subclass_proc -> tauri_runtime_wry::handle_event_loop` dropping a WebviewWrapper mid-`wait_with_pump`. Single-thread reentrant self-deadlock. NO region/capture/OCR code on any stack.
- TRIGGER: `confirm_region_selection` (src-tauri/src/shell/region.rs ~619-628) does `close_window(SELECT_WINDOW_LABEL)` (destroy select overlay) then `open_preview_window` (CREATE preview WebView) in the SAME synchronous command/event-loop turn. Creating a WebView2 (wait_with_pump) while the select window's DestroyWindow is still pending makes wry process the destroy mid-creation -> deadlock. Predates TASK-021.
- TASK-021's capture fixes address code that never runs on this path - keep as latent hardening; they do NOT fix this.
- Debugger picks the safest fix FIRST (no implementer guessing - the last fix guessed wrong).

## To do
- [ ] debugger: confirm the mechanism against the dump + the pinned wry/tao/tauri versions; choose the SAFEST fix and say why. Candidates: (a) defer `open_preview_window` to a later event-loop tick (after the select window's Destroyed fires); (b) HIDE the select overlay, open/show preview, close select later; (c) single persistent window navigated/toggled instead of destroy+create.
- [ ] Implement the chosen fix in shell/region.rs (and audit start_region_selection + every other close+open-in-one-turn window transition - caption/settings/history too).
- [ ] Keep TASK-021's capture hardening intact.

## Test scenarios / acceptance
- [ ] The confirm -> close-select -> open-preview WINDOW TRANSITION does not deadlock; the app stays responsive and reaches preview / consent dialog.
- [ ] e2e drives the real window transition (not just capture) against the real windows and asserts responsiveness.
- [ ] A cdb re-dump during/after the transition on the RELEASE binary shows the main thread is NOT parked in WebviewWrapper::drop / wait_with_pump. Include the dump excerpt.

## Orchestration notes
- 2026-07-11: the owner attached cdb to the live hung release process; the dump proves a reentrant window-lifecycle deadlock, not the capture bug TASK-021 chased. debugger FIRST, then implement. Verification bar: REPRODUCE the transition + a CLEAN post-fix cdb dump - do not declare fixed on tests/launch alone.

## Session log (AI session log)

| Date | Who | What was done | Result |
|------|-----|---------------|--------|
| 2026-07-11 | orchestrator | Registered from the owner cdb dump (reentrant WebviewWrapper::drop deadlock on close-select+open-preview in one turn). Dispatching debugger first to confirm mechanism + pick the safest fix | Active |

## Result
<Fill when moving to Done; link the PR/commit. Then move the file to docs/tasks/done/.>
