---
title: "TASK-023: Fix reentrant window-lifecycle deadlock (close-select + open-preview in one turn)"
status: Done
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
| 2026-07-11 | debugger | Root-caused against the cdb dump + pinned wry 0.55.1/tao 0.35.3/tauri 2.11.5 (non-reentrant webview-map Mutex). Confirmed single-thread reentrant deadlock (wait_with_pump -> DestroyWindow -> WebviewWrapper::drop -> lock_contended); NO capture/OCR on any stack. Chose fix (a): defer preview open to the select window's Destroyed event. Audited - only confirm_region_selection had the pattern. | Mechanism + fix chosen |
| 2026-07-11 | frontend-ui-dev | Implemented: confirm arms pending BEFORE close + returns (no in-turn open); mod.rs on_window_event opens preview on SELECT Destroyed only when a region is pending. Built RELEASE binary, drove the transition, re-attached cdb: thread 0 idle in NtUserGetMessage - ZERO wait_with_pump/WebviewWrapper::drop/lock_contended. e2e drives real start->confirm->close with SYNC UI-thread liveness. Then closed the stale-pending AC-02.1 hole (disarm on open_selection_window + test). | Fixed + clean dump |
| 2026-07-11 | qa-test | Independent: cargo 275 passed (2 new lifecycle tests + the stale-arm test); vitest 228; clippy/fmt clean. Independently rebuilt the release binary, drove the transition, and attached its OWN cdb (pid 63968): thread 0 idle in NtUserGetMessage/GetMessageA, zero deadlock frames (even caught thread 0 pumping a window-create during the transition, not blocked). Transition e2e GREEN, sync liveness 23-26ms. tsc errors pre-existing. | Green (2nd clean dump) |
| 2026-07-11 | code-reviewer | PASS (after the stale-pending fix). Destroyed-deferred-open removes the reentrancy; disarm on open_selection_window closes the AC-02.1 stale-arm hole (regression test); consent re-arm contract intact; TASK-021 hardening + only-confirm-had-the-pattern confirmed; tsc errors pre-existing. | PASS |
| 2026-07-11 | orchestrator | Merged PR #42 (merge commit a542deb); CI GREEN; secret-scan clean; master-plan add-only. Closed: Done in frontmatter + board, moved to done/. | Done |

## Result
The REAL region-select hang - a single-thread REENTRANT WINDOW-LIFECYCLE DEADLOCK - is fixed on
`main` (PR #42, merge commit a542deb). Root cause (cdb dump, ground truth): `confirm_region_selection`
closed the select overlay (queued DestroyWindow) then SYNCHRONOUSLY created the preview WebView2
(wait_with_pump) in the SAME event-loop turn; the create's message pump dispatched the pending
destroy and reentered wry to drop the select WebviewWrapper, blocking on the non-reentrant
webview-map Mutex the create already held (wry 0.55.1 / tao 0.35.3 / tauri 2.11.5). NO
capture/OCR/whisper code was on any stack - TASK-021 chased a different (capture) bug.

FIX (debugger's chosen option a): `confirm_region_selection` arms `pending_region` FIRST, closes
the select overlay, and RETURNS (no in-turn preview create). `on_window_event` opens the preview
on the select window's `WindowEvent::Destroyed` (a fresh event-loop iteration, after the destroy
fully completed and the WebviewWrapper mutex released) only when a region is pending. This
structurally guarantees destroy-before-create - no reentrancy. Also closed a follow-on AC-02.1
regression (stale `pending_region` -> Esc could open a stale preview) by clearing it at the start
of `open_selection_window`.

PROOF (not assertion) - TWO independent cdb dumps of the live RELEASE process during the transition:
- BEFORE (owner's hang dump): thread 0 = `Mutex::lock_contended <- <WebviewWrapper as Drop>::drop
  <- NtUserDestroyWindow <- webview2_com::wait_with_pump`.
- AFTER (dev's + qa-test's independent dumps): thread 0 idle in `NtUserGetMessage`/`GetMessageA`,
  ZERO occurrences of wait_with_pump / WebviewWrapper::drop / lock_contended / NtUserDestroyWindow.
Plus the region-select e2e now drives the REAL start->confirm->close window transition and asserts
liveness via a SYNC executeScript probe serviced by the wry UI thread (thread 0, the exact thread
the deadlock froze) - green, 23-26ms.

Gates: qa-test 275 passed + independent clean dump + transition e2e; code-reviewer PASS (after the
stale-pending fix); secret-scan clean; CI green.

CAVEATS / honest limits:
- The automated e2e drives the transition via the real start/confirm commands (fire-and-forget),
  NOT a human mouse-drag - but that command path is exactly what a human drag invokes, and the cdb
  dumps prove the UI thread is not parked during it.
- Why the prior e2e (TASK-022) missed this: its probe drove the pipeline directly and BYPASSED the
  window transition; and msedgedriver's ASYNC invoke channel degrades on a satellite WebView, so an
  async probe cannot distinguish a driver limit from a deadlock. The new spec uses a SYNC UI-thread
  probe + cdb, which is the correct instrument.
- TASK-021 capture hardening (COM-init worker, bounded capture/download timeouts, consent-before-
  capture, overlay-destroy-before-capture) is KEPT as valid latent hardening; it does not run on
  this path and was never the fix for THIS hang.
