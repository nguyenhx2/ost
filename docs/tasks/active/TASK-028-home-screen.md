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
| 2026-07-11 | frontend-ui-dev | Built the home screen (`src/App.tsx` + `App.css`): 4 primary actions (region select, audio start/stop, Settings, History) each wired to the existing typed IPC/hooks (`regionIpc.startSelection`, `useAudioSession`, `settingsIpc.open`, `historyIpc.open`), hotkey chips next to region-select/audio (from `useHotkeys`), and a status block (active provider+model, STT tier + downloaded, audio running) composed entirely from existing hooks (`useProviderSelection`, `useProviderPickerMetadata`, `useSttModels`, `useAudioSession`) - no new backend command needed. Factored the TASK-025 no-key notice pattern into a new shared `src/components/ProviderKeyNotice.tsx` (icon+message+Open-Settings button, same affordance/copy style) and a shared `src/lib/sttModelLabels.ts` (STT tier label-key map, deduped out of `SettingsView.tsx`). Added i18n keys (vi+en, fully accented) and Vitest coverage (`App.test.tsx`, `ProviderKeyNotice.test.tsx`). `npm run lint` and `npm run test` clean (36 files, all passing). Built the RELEASE binary locally (`npm run tauri build -- --no-bundle`, cmake added to PATH) and ran it; confirmed no window-level scrollbars/white bleed (shell-fill contract) and confirmed the overall layout, headings, labels, and i18n strings render correctly. Could NOT get a fully conclusive pixel-level confirmation of the right-aligned Badge/hotkey-chip/Button controls specifically: this sandbox's window-focus APIs (SetForegroundWindow/SendKeys) are unreliable for automation (loopback also blocked, matching the sandbox limitation already in known-issues.md), so screenshots required forcing the window to the foreground via an external `SetWindowPos`/maximize call; under that FORCED external resize the right-aligned controls intermittently failed to paint in the main window specifically (not reproducible: (a) in a headless-Chromium render of the identical exported HTML/CSS at matching viewport sizes - narrow and full 2048x1280 - which shows the Badge/Button correctly, nor (b) in the same running app's caption-overlay window, which renders its own Badge/Slider/IconButton correctly without needing that forced resize). This points to a WebView2 repaint artifact of the synthetic external maximize rather than a code defect, but flagging for the owner's own visual check on the release binary under normal window interaction (mirrors the TASK-021/TASK-024 precedent of owner-verified pixel checks). No shell/ files touched; no new backend command added. | Built and tested, pending owner pixel-level visual confirmation |

## Result
<Fill when moving to Done; link the PR/commit. Then move the file to docs/tasks/done/.>
