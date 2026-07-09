---
title: "TASK-008: Region-select overlay + translation preview UI"
status: Planned
fr: "FR-02, FR-04"
owner: frontend-ui-dev
deps: "TASK-002"
priority: P0
phase: 1
created: 2026-07-09
tags: [task]
---

# TASK-008: Region-select overlay + translation preview UI

## Goal
The user can trigger region selection (hotkey/tray), drag a region on a dimmed fullscreen
overlay, and see a preview panel that shows OCR text immediately and streams the
translation in.

## Inputs / context
- FR-02/FR-04 specs; `design-system.md` (OverlayPanel primitive, tokens);
  `human-in-the-loop.md` (provider badge, confidence flags); `frontend.md` (keyboard
  operability, dark-first).

## To do
- [ ] Fullscreen dimmed selection overlay window (esc to cancel, drag to select,
      pixel-coords via IPC).
- [ ] Preview `OverlayPanel`: source text -> translated text, provider/model badge, copy,
      pin, re-translate, close; low-confidence markers.
- [ ] Global hotkey + tray menu entry to start selection (`src-tauri/src/shell/`).
- [ ] i18n keys (vi + en) for all strings; Vitest for hooks with mocked IPC.

## Test scenarios / acceptance
- [ ] Full flow works against a mocked pipeline (fake events) without TASK-007.
- [ ] Keyboard-only operation possible (WCAG 2.1 AA path).
- [ ] No design-system violations (code-reviewer hard gate).

## Session log (AI session log)

| Date | Who | What was done | Result |
|------|-----|---------------|--------|
| 2026-07-09 | orchestrator | Task created and registered in master-plan (bootstrap seed) | Planned |

## Result
<Fill when moving to Done.>
