---
title: "TASK-016: Caption overlay UI (bilingual subtitles)"
status: Planned
fr: "FR-01, FR-04"
owner: frontend-ui-dev
deps: "TASK-015, TASK-008"
priority: P0
phase: 2
created: 2026-07-10
tags: [task]
---

<!-- TASK FILES ARE WRITTEN 100% IN ENGLISH (see .claude/rules/task-tracking.md). -->

# TASK-016: Caption overlay UI (bilingual subtitles)

## Goal
Render the live bilingual caption overlay with a provider/model badge, low-confidence flagging and keyboard-operable controls.

## Inputs / context
- Related FR: [FR-01](../../specs/05-functional-requirements.md#fr-01), FR-04; SCR-01.
- Related files: `src/` overlay window, `src-tauri/src/shell/` window management.
- human-in-the-loop.md: AI output is a proposal; low-confidence flagged; provider transparency.

## To do
- [ ] Always-on-top caption overlay: source + translated text, legible over any background (token scrim, user opacity).
- [ ] Provider/model badge always visible; switch is one interaction away (AC-03.5).
- [ ] Low-confidence STT segments visibly flagged (AC-01.7).
- [ ] pin/copy/dismiss/drag/opacity, all keyboard-operable (AC-04.3, AC-04.8).
- [ ] Primitives + tokens only; i18n vi+en; WCAG AA; Vitest.
- [ ] AC-01.3: render the DETECTED source language on the overlay (the audio:caption payload carries it; TASK-014/015 produce it, no consumer yet).
- [ ] AC-01.4/01.5 Settings controls (currently UNOWNED - spec-guardian): a source-language pin/override control (default Auto) and a target-language selector (default vi) in Settings, plumbed to `start_audio_session`.
- [ ] AC-01.8 UI half: whisper first-run consent + hardware-recommended-model UI (reuse the ConsentDialog pattern from the OCR model consent; handle the `models:consent-required` event for `whisper-ggml`) and a model-change control in Settings.
- [ ] Provide a way to START/STOP an audio session for this UI (basic control ok; the global hotkey + tray start/stop is TASK-017) so the overlay is exercisable.
- [ ] Record each completed audio caption to history via the existing `recordTranslation` seam (TASK-018), sessionType `audio`; and MAKE `recordTranslation` write ATOMIC (read-modify-write) so concurrent region+audio completions do not drop entries (TASK-018 follow-up).

## Test scenarios / acceptance
- [ ] AC-01.1 overlay appears on session start; AC-01.7 low-confidence flag; AC-03.5 provider badge; AC-04.3 keyboard controls.
- [ ] Design-system hard gate holds; no emoji; lucide icons.

## Orchestration notes
- 2026-07-10: spec-guardian flagged AC-01.3 overlay detected-language display and the AC-01.4/01.5 source/target Settings controls as UNOWNED by Phase 2 - assigned here. Also folds the whisper first-run consent/model UI (AC-01.8 half) and the TASK-018 audio-history-record + atomic-write follow-up. Depends on TASK-015 audio:caption event (now on main).
- Consumes the caption event from TASK-015.

## Session log (AI session log)

| Date | Who | What was done | Result |
|------|-----|---------------|--------|
| 2026-07-10 | orchestrator | Task created and registered in master-plan (Phase B decomposition) | Planned |

## Result
<Fill when moving to Done; link the PR/commit. Then move the file to docs/tasks/done/.>
