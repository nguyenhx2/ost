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
- [ ] Root cause: base.css sets body transparent but there is no html/#root height+width+overflow rule; content does not fill and the WebView default (white) bleeds.
- [ ] Establish a shared shell rule (tokens only): html, body, #root fill 100%, transparent, overflow hidden at the shell level; each view panel resizes with the window.
- [ ] Audit and fix every surface: region preview, region select, settings, history, caption overlay, consent dialog.

## Test scenarios / acceptance
- [ ] No scrollbars appear on any window at default and stretched sizes.
- [ ] No white/opaque bleed around panels on transparent overlay windows at any size.
- [ ] Panels fill the window and resize with it.
- [ ] Design-system hard gate: tokens + primitives only, no hardcoded hex/px, no inline style bypass.
- [ ] npm run lint and npm run test pass locally; CI lint-and-test green on the PR.

## Orchestration notes
- Verify on the RELEASE binary (npm run tauri build -- --no-bundle then run ost.exe); debug/tauri dev load localhost and is blocked in this environment (known-issues). The dev agent cannot do the visual release check itself - flag it for owner confirmation.

## Session log (AI session log)

| Date | Who | What was done | Result |
|------|-----|---------------|--------|
| 2026-07-11 | orchestrator | Registered task; dispatched frontend-ui-dev (sonnet) after registration merge | pending |

## Result
<Fill when moving to Done; link the PR/commit.>
