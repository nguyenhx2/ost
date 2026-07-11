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
- [x] Create a shared deferred window-open helper (e.g. `shell::windows::open_deferred`) that never builds a webview inline on the calling turn
- [x] Route all five window-creation sites through the helper
- [x] Add a static guard test/check that fails when a raw `WebviewWindowBuilder::...build()` appears outside the helper
- [x] Add e2e tests that drive window-opening from a WebView context for caption, settings, and history (not just region)
- [x] Verify the fix with cdb thread dump on the RELEASE binary: before shows deadlock frames; after shows thread 0 idle (e.g. `NtUserGetMessage`) with none of those frames

## Test scenarios / acceptance
- [x] One shared helper (e.g. `shell::windows::open_deferred`) exists and is used by all five window-creating sites
- [x] No raw `WebviewWindowBuilder::...build()` exists outside the helper (guard test enforces this)
- [x] E2E test drives window-opening from a WebView context for caption, settings, and history
- [x] RELEASE binary thread dump before the fix shows the deadlock frames (captured separately by debugger, in parallel)
- [x] RELEASE binary thread dump after the fix shows thread 0 idle with none of those deadlock frames

## Orchestration notes
- This is a critical fix to prevent app hangs when the user interacts with settings/history/caption windows via WebView callbacks.
- The fix should be generic so it works across all window types.
- Performance implication: use task scheduling (not blocking event loop) to defer window creation.

## Session log (AI session log)

| Date | Who | What was done | Result |
|------|-----|---------------|--------|
| 2026-07-11 | orchestrator | Task registered from owner hands-on session mission brief | Registered |
| 2026-07-11 | frontend-ui-dev | Implemented `shell::windows::open_deferred` (`src-tauri/src/shell/windows.rs`): checks for an existing window (focus/show inline - never a build, so safe) and, only when a build is needed, spawns a worker thread that calls `AppHandle::run_on_main_thread` FROM OFF the main thread. `run_on_main_thread` (tauri-runtime-wry `send_user_message`) takes a same-thread fast path that runs the closure INLINE when called from the main thread (which would reproduce the deadlock); calling it from a different thread forces the tao event-loop-proxy `send_event` queued path, drained at the top of a FRESH event-loop iteration - the same safe point TASK-023 used via `WindowEvent::Destroyed`, generalized so no "prior window closing" hook is needed. Routed all five sites through it: `caption::open_caption_window`, `settings::open_settings_window`, `history::open_history_window`, `region::open_selection_window` (post-build monitor positioning + show/focus preserved via an `after_build` hook), `region::open_preview_window`. Each function's public signature is unchanged (`Result<(), XError>`) but now only covers the synchronous existing-window-focus path; a deferred build failure is logged via `tracing::error!`, never surfaced (matches the existing region.rs fire-and-forget pattern). Added a guard test (`shell::windows::tests::no_raw_webview_window_builder_outside_this_module`) that greps every sibling `shell/*.rs` file for `WebviewWindowBuilder` and fails `cargo test` if found outside `windows.rs`; verified it fails when a violation is reintroduced (temporarily reinserted one, confirmed RED, reverted). Added an e2e-only `windows::e2e_list_window_labels` probe (mirrors `region::e2e_region_probe`) and `e2e/specs/window-open-deferred.spec.ts` driving `open_caption_overlay` / `open_settings` / `open_history` from a REAL WebView IPC callback (the exact owner repro path), asserting both non-hang (sync liveness probe) and that the deferred build actually produced the window (label list). Verified: `cargo fmt --check` clean, `cargo clippy --all-targets -- -D warnings` clean (default and `--features e2e`), `cargo test --lib` 326 passed (1 new + guard), `npm run test` 277 passed, `npm run lint` clean. Built the RELEASE binary (`npm run tauri build -- --no-bundle --features e2e`) and ran `npm run test:e2e:window-open` against it: all 4 specs green (liveness probes ~20ms; window labels correctly show `caption-overlay`/`settings`/`history` after each open). Captured a cdb thread dump (`~*kn 25`) of the LIVE post-transition release process: thread 0 idle in `win32u!NtUserGetMessage` -> `user32!GetMessageW` -> app loop; zero occurrences of `wait_with_pump`/`WebviewWrapper`/`lock_contended`/`NtUserDestroyWindow` anywhere in the dump. Rebased on `origin/main` (bookkeeping PR #56 merged first). | Fix verified by clean cdb dump + green e2e (non-hang + window-label proof) |
| 2026-07-11 | frontend-ui-dev | PR #57 review follow-up on `fix/deferred-window-open`: (1) BLOCKER - `Existing::apply` no longer swallows `show()`/`set_focus()` failures on the already-open fast path; both now log via `tracing::error!(label, %error, ...)`, matching the discipline already used for deferred-build failures in the same file. (2) The guard test `no_raw_webview_window_builder_outside_this_module` now recurses `src/shell/**/*.rs` (manual recursion, no new dependency) instead of a single non-recursive `read_dir`, so a raw `WebviewWindowBuilder` reintroduced in a future nested submodule is still caught; proved by temporarily adding `src/shell/nested_probe/mod.rs` with an inline `WebviewWindowBuilder` reference, confirming the guard test failed and named the nested file, then removing the probe (working tree confirmed clean of it before commit). (3) Added a comment on the `thread::spawn` call explaining why a bare OS thread is used instead of `tokio::task::spawn_blocking` (the closure does no blocking work to hand off - it exists solely to be "not the main thread" so `run_on_main_thread` takes the queued path; a Tokio blocking-pool thread would add a runtime dependency and borrow a pool slot for no benefit). Gates: `cargo fmt --check` clean, `cargo clippy --all-targets -- -D warnings` clean. First full `cargo test --all-targets` run showed 2 transient failures in `stt::download::tests` (digest-mismatch and stalled-connection timing, out of frontend-ui-dev scope) under the load of the prior background clippy/test builds; isolated single-threaded reruns immediately after, both before and after this diff (verified via `git stash`), passed 5/5, and a clean full rerun once background compilation settled passed 326/326 (2 ignored, expected: one needs a real display, one hits the real OS keychain) - confirming timing flakiness unrelated to this change, not a regression. | Blocker and both should-fix items resolved; recursive guard reproven RED then GREEN |

## Result
<Fill when moving to Done; link the PR/commit. Then move the file to docs/tasks/done/.>
