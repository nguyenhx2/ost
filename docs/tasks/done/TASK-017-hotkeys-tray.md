---
title: "TASK-017: Global hotkeys + tray UX"
status: Done
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
| 2026-07-11 | frontend-ui-dev | Rebased feat/hotkeys-tray onto origin/main (a972580) after PR #32 (TASK-019 HeavySessionCoordinator) + PR #33 landed on the same files; git auto-merged with no textual conflict but result was RE-COMPILED to prove the union. Union resolutions kept BOTH sides: lib.rs = TASK-019 coordinator construction + .manage into Region/AudioSession pipelines AND my 3 hotkey/history commands + .on_window_event(shell::on_window_event); audio_session.rs = TASK-019 coordinator begin/register/end(Stt) + unload AND my EVENT_AUDIO_STOPPED const (emit lives in mod.rs on_window_event); mod.rs = my on_window_event (close-to-tray + audio:stopped emit); caption.rs = my close_caption_window helper; master-plan diff vs origin/main is ONLY the TASK-017 Planned->Active row (TASK-016/018/019 stay Done). Re-verify on MERGED tree: cargo fmt --check clean, clippy --all-targets -j2 -D warnings clean, cargo test 268 passed/0 failed/1 ignored (incl. shell::hotkeys 8 AND core::session 7 together), vitest 228 pass (28 files), eslint+prettier clean, tsc --noEmit clean. Force-pushed with --force-with-lease. | Active |
| 2026-07-10 | qa-test | Verified merged tree: vitest 228 passed; cargo test 268 passed / 0 failed / 1 ignored (shell::hotkeys 8 AND core::session 7 pass together); clippy -D warnings + fmt clean. AC-04.1 hotkeys (3 configurable, defaults, reconfig+persist, conflict rollback) + AC-04.2 tray unit-covered; live global-hotkey/tray-click are e2e-only (flagged). No test added. | Green |
| 2026-07-10 | code-reviewer | PASS. Human-in-the-loop: hotkeys/tray drive only OST windows, NO auto-outbound into other apps. Rebase union coherent (lib.rs + audio_session.rs keep both TASK-019 coordinator + TASK-017 additions). master-plan non-revert. thiserror, thin handlers, no unwrap outside tests; design-system + i18n vi+en clean. Nits: recorder leaves globals live during capture; start/stop race; poisoned-lock default. | PASS |
| 2026-07-10 | security-reviewer | PASS. No hotkey/tray auto-outbound into other apps (human-in-the-loop). Hotkey session + persisted config carry only provider/model NAMES + accelerator strings (no key). History window capability least-privilege (no fs/shell/http). No captured content/keys in logs. | PASS |
| 2026-07-10 | orchestrator | Rebased onto main (union-merged with TASK-019 coordinator, recompiled 268 passed - not a blind text-merge). Merged PR #34 (merge commit d0627e3); CI GREEN; secret-scan clean. Closed: Done in frontmatter + board, moved to done/. | Done |

## Result
Global hotkeys + tray UX + the deferred FR-04 items are on `main` (PR #34, merge commit
d0627e3). FR-04 is now complete. Delivered: configurable global hotkeys via
tauri-plugin-global-shortcut (3 actions - toggle audio session Ctrl+Alt+A, region select
Ctrl+Alt+R, show/hide overlay Ctrl+Alt+O), reconfigurable in Settings and persisted as
accelerator strings, with conflict rollback (AC-04.1); a system tray with a full menu
(audio start/stop, region select, Settings, History, quit) + close-to-tray (hide, not exit;
quit is tray-only) (AC-04.2); a History window (open_history + `?view=history`) with a "Lich
su" tray item (deferred from TASK-018); useHistory live-update (store-change + focus,
TASK-018 nit closed); an audio:stopped event resetting the Settings running state (TASK-016
nit closed); the caption.modelBlocked i18n key wired.

Hotkeys/tray ONLY trigger the app's own actions - never auto-type/send/click into another
application (human-in-the-loop, security-reviewer verified). The hotkey-started session and
persisted config carry only provider/model names + accelerator strings (no key); the History
window capability is least-privilege.

Gates: qa 228 frontend + 268 cargo (merged tree, both suites); code-reviewer PASS;
security-reviewer PASS; secret-scan clean; CI green.

Follow-ups (e2e / manual - WebdriverIO + tauri-driver, tracked): global hotkey firing while
another app is focused; live tray-click dispatch + tray construction; the Rust OS-conflict
register/rollback branch; close-to-tray hide-vs-destroy - all AppHandle/OS-bound. Minor
code nits (recorder unregister-during-capture; start/stop race; poisoned-lock default) are
low-impact author-discretion items.
