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
| 2026-07-11 | frontend-ui-dev | Implemented debugger's chosen fix (candidate a, defer open-preview). confirm_region_selection now ARMS pending region THEN close_window(SELECT) and RETURNS - no in-turn open_preview_window. Added shell::on_window_event Destroyed branch: on region-select Destroyed with a pending region, call region::open_preview_window at the top of a fresh event-loop iteration (after NtUserDestroyWindow returned + WebviewWrapper dropped). cancel arms nothing -> no preview. Made open_preview_window + should_open_preview_after_select_close pub(crate). TASK-021 capture hardening untouched. Added 2 unit tests (arm-before-close + confirm/cancel distinction). Extended region-select e2e to drive the REAL start->confirm->close transition against real windows with a SYNC liveness probe. Verified: cargo fmt clean, clippy -D warnings clean, cargo test 274 pass (2 new), Vitest 228 pass, tsc/lint clean. RELEASE binary rebuilt (--features e2e); e2e region spec GREEN (3 passing, liveness 24ms/23ms). cdb re-dump on the live release process after the transition: thread 0 (main) idle in NtUserGetMessage - NONE of wait_with_pump / WebviewWrapper::drop / lock_contended (vs original hang dump frames 05/06/24). | Fix verified by clean cdb dump + green e2e |
| 2026-07-11 | frontend-ui-dev | Applied code-reviewer should-fix (correctness regression the deadlock reorder introduced): the select Destroyed branch now opens the preview off shared pending_region that was never cleared on a NEW selection cycle, so a stale arm (confirm -> consent-required -> take_and_recognize RESTORES pending -> preview closed WITHOUT granting -> pending stays Some) could open a preview over the OLD region when the user starts a fresh selection and presses Esc - violating AC-02.1. Fix: added disarm_pending_region helper (sets pending_region inner to None), called at the TOP of open_selection_window BEFORE the early-focus return, scoping the Destroyed decision to the current cycle. Does NOT touch the consent re-arm contract (lives inside the preview lifecycle after a confirm, no intervening select-open). Deadlock fix (confirm arm-before-close, mod.rs Destroyed branch), TASK-021 hardening, and e2e spec core all untouched (diff is +65 lines to region.rs only, 0 deletions). Added regression unit test disarm_clears_a_stale_arm_so_a_fresh_cycle_esc_opens_no_preview. Verified: cargo fmt --check clean, clippy --all-targets -D warnings clean, cargo test 275 pass (1 new), Vitest 228 pass, tsc/lint clean. | Regression fixed, all gates green |

## Result
<Fill when moving to Done; link the PR/commit. Then move the file to docs/tasks/done/.>
