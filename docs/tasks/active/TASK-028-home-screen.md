---
title: "TASK-028: Build the main-window home screen (primary actions + status at a glance)"
status: Active
fr: FR-04
owner: frontend-ui-dev
deps: TASK-025
priority: P0
phase: 3
created: 2026-07-11
tags: [task]
---

<!-- TASK FILES ARE WRITTEN 100% IN ENGLISH (see .claude/rules/task-tracking.md). -->

# TASK-028: Build the main-window home screen (primary actions + status at a glance)

## Goal
Build a functional main-window home screen that exposes the app's primary actions and real-time status, replacing the current bare `<main><h1>OST</h1></main>`.

## Inputs / context
- Related FR: [FR-04](../../specs/05-functional-requirements.md#fr-04)
- Related TASK: TASK-025 (no-API-key onboarding notice)
- Related files/modules:
  - `src/App.tsx` (currently bare)
  - Design system: `src/components/ui/`, `src/styles/tokens.css`

## Problem
`src/App.tsx` is a bare `<main><h1>OST</h1></main>`. The main window exposes none of the app's functions, so the user must hunt the tray to access translate, audio, settings, or history.

## To do
- [ ] Design and implement primary actions panel: translate a screen region, start/stop live audio translation, settings, history - each showing its hotkey
- [ ] Design and implement status at a glance: active provider + model, whether an API key is configured, selected STT model tier and download status, whether an audio session is running
- [ ] Ensure design-system hard gate compliance: primitives + tokens only, no hardcoded hex/px, no native `<select>`, no raw `title=`, no emoji, lucide-react icons only
- [ ] Add i18n (Vietnamese + English with fully accented Vietnamese)
- [ ] Ensure compliance with TASK-024 shell-fill contract: no white bleed, no window-level scrollbars
- [ ] Add any new primitives to `.claude/rules/design-system.md` in the same PR

## Test scenarios / acceptance
- [ ] Primary actions are accessible and show their hotkeys (e.g., region select, audio start/stop, settings, history)
- [ ] Status display shows provider name, model name, API key configured status, STT model and download status, audio session status
- [ ] When no API key is configured, the no-key onboarding notice from TASK-025 is shown with an "Open Settings" affordance
- [ ] Design system compliance verified: all colors/spacing from tokens, no hardcoded values, primitives only, no emoji, lucide-react icons
- [ ] i18n strings for Vietnamese and English with fully accented Vietnamese
- [ ] No white bleed, no window-level scrollbars (TASK-024 shell-fill contract)
- [ ] Any new UI primitives added have their row in `.claude/rules/design-system.md` Landed table

## Orchestration notes
- This is a high-visibility task that unblocks user-facing functionality on the main window.
- Coordinate with TASK-025 (no-key notice) for the onboarding state.
- Any new UI primitives created should follow the design-system hard gate and be documented in the same PR.

## Session log (AI session log)

| Date | Who | What was done | Result |
|------|-----|---------------|--------|
| 2026-07-11 | orchestrator | Task registered from owner hands-on session mission brief | Registered |

## Result
<Fill when moving to Done; link the PR/commit. Then move the file to docs/tasks/done/.>
