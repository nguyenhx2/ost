---
title: "TASK-024: UI polish - transparent-window white-bleed, scrollbars, fill-on-resize sweep"
status: Active
fr: FR-04
owner: frontend-ui-dev
deps: TASK-023
priority: P1
phase: 3
created: 2026-07-11
tags: [task]
---

# TASK-024: UI polish - transparent-window white-bleed, scrollbars, fill-on-resize sweep

## Goal
Fix the class of transparent-window layout bugs the owner hit in the region preview (white background bleed on resize, scrollbars on two edges, content not filling the window) and audit-fix every UI surface for the same defects.

## Inputs / context
- Related FR: [FR-04](../../specs/05-functional-requirements.md#fr-04)
- Related files/modules: src/styles/base.css, src/App.css, src/views/*.css and *.tsx (RegionPreviewView, RegionSelectView, SettingsView, HistoryView, CaptionOverlayView), src/components/ConsentDialog.css
- Owner screenshots show: scrollbars on two edges of the region preview window; a white border/margin around the dark panel when the window is stretched (transparent window shows white wider than the dark content).

## To do
- [x] Root cause: base.css sets body transparent but there is no html/#root height+width+overflow rule; content does not fill and the WebView default (white) bleeds.
- [x] Establish a shared shell rule (tokens only): html, body, #root fill 100%, transparent, overflow hidden at the shell level; each view panel resizes with the window.
- [x] Audit and fix every surface: region preview, region select, settings, history, caption overlay, consent dialog.

## Test scenarios / acceptance
- [x] No scrollbars appear on any window at default and stretched sizes (contained internally instead - see orchestration notes; needs owner visual confirmation on the release binary).
- [x] No white/opaque bleed around panels on transparent overlay windows at any size (needs owner visual confirmation on the release binary).
- [x] Panels fill the window and resize with it.
- [x] Design-system hard gate: tokens + primitives only, no hardcoded hex/px, no inline style bypass.
- [x] npm run lint and npm run test pass locally; CI lint-and-test green on the PR.

## Orchestration notes
- Verify on the RELEASE binary (npm run tauri build -- --no-bundle then run ost.exe); debug/tauri dev load localhost and is blocked in this environment (known-issues). The dev agent cannot do the visual release check itself - flag it for owner confirmation.
- Root cause confirmed by code inspection: `src/styles/base.css` set `body { background-color: transparent }` only - `html`/`#root` had no width/height/overflow rule, so they sized to content, not the window; anything outside that content box fell back to the WebView's own default (opaque) background, and unconstrained content taller/wider than the window overflowed at the `html`/`body` level as window-level (double-edge) scrollbars.
- Fix: `src/styles/base.css` now sets a shared shell contract - `html, body, #root { width:100%; height:100%; overflow:hidden; background-color:transparent }` (tokens-only values, no new tokens needed). Guarded by a new text-level regression test, `src/styles/base.css.test.ts`, that fails if this rule is dropped or weakened.
- Per-surface audit (transparent overlay windows vs opaque app windows get different fill treatment):
  - `region-preview` (transparent, resizable, TASK-024 owner-reported bug) - FIXED. `.region-preview` now fills the window (`width/height: 100%`); `.ost-overlay-panel` inside it now also fills the window (`width/height: 100%`, capped by the existing `min-width`/`max-width`) and is the ONE contained internal scroll region (`overflow-y: auto; overflow-x: hidden`), so any content taller than the window scrolls inside the panel instead of producing a window-level scrollbar. Panel bounds equal window bounds, so this containment does not newly clip anything that was not already clipped by the window edge itself.
  - `caption-overlay` (transparent, resizable) - same class of bug, same fix applied (`CaptionOverlayView.css`), mirroring `region-preview`.
  - `region-select` (transparent, fullscreen, non-resizable) - audited, NO ISSUE FOUND. `.region-select` uses `position: fixed; inset: 0`, which already covers the exact window/viewport bounds regardless of `html`/`body` sizing, and the window is created non-resizable at the primary monitor's size, so the reported resize class of bug does not apply here.
  - `settings` (opaque, resizable, has real scrollable lists) - FIXED. `.settings` now fills the window (`width/height: 100%`) and is the single vertical scroll region (`overflow-y: auto; overflow-x: hidden`), removing the possibility of a horizontal window-level scrollbar while preserving legitimate vertical scrolling for long provider/hotkey lists.
  - `history` (opaque, resizable, has a real scrollable entry list) - same fix applied (`HistoryView.css`), mirroring `settings`.
  - `ConsentDialog` / `Dialog` primitive - audited, NO ISSUE FOUND. `.ost-dialog-backdrop` is `position: fixed; inset: 0` (always covers the full window) and `.ost-dialog` already had its own contained `max-height: 100%; overflow-y: auto`, so it does not exhibit this bug class; not modified.
  - `App.tsx` / `App.css` (the default/no-`view` route, only ever mounted in the `main` window, which `shell/mod.rs` hides immediately at startup for the tray app) - low-risk, but aligned for consistency: `.app` now uses `width/height: 100%` instead of `min-height: 100vh`, matching the new shell contract.
  - Tauri window configs (`src-tauri/tauri.conf.json`, `src-tauri/src/shell/region.rs`, `src-tauri/src/shell/caption.rs`, `src-tauri/src/shell/settings.rs`, `src-tauri/src/shell/history.rs`) - audited, NO CHANGE MADE (Rust code is out of frontend-ui-dev's write scope; this was inspection only). Findings for the orchestrator: `region-select`/`region-preview`/`caption-overlay` all correctly set `.transparent(true).decorations(false)`; `settings`/`history` correctly omit `.transparent(true)` (opaque windows) and use `.resizable(true)`; the main window in `tauri.conf.json` has no `transparent` flag (opaque, correct, and it stays hidden). No transparent-flag inconsistency found; no Rust-side change needed for this task.
- Verification limits: this pass is code inspection + `npm run lint` + `npm run test` (229 tests passed) only - `tauri dev` is blocked in this environment, so the actual pixel-level "no white bleed" / "no scrollbar" / "fills on resize" behavior on `region-preview` and `caption-overlay` needs the owner's visual check on the release binary, as already noted above.

## Session log (AI session log)

| Date | Who | What was done | Result |
|------|-----|---------------|--------|
| 2026-07-11 | orchestrator | Registered task; dispatched frontend-ui-dev (sonnet) after registration merge | pending |
| 2026-07-11 | frontend-ui-dev | Established the html/body/#root shell fill contract in base.css (fixes WebView white bleed + window-level scrollbars); applied the matching per-surface fill/scroll fix to region-preview, caption-overlay, settings and history; audited region-select, ConsentDialog/Dialog and the Rust window configs with no issue found; added a base.css.test.ts regression guard | npm run lint and npm run test (229 tests) pass; visual confirmation still needed on the owner's release binary |

## Result
<Fill when moving to Done; link the PR/commit.>
