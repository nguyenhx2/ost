---
title: "TASK-016: Caption overlay UI (bilingual subtitles)"
status: Done
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
| 2026-07-10 | frontend-ui-dev | Started: read TASK-015 audio_session, region preview pattern, history seam; flip status to Active | Active |
| 2026-07-10 | frontend-ui-dev | Built caption overlay (view+hook), FR-01 Settings audio controls (source/target/whisper consent/start-stop), Tauri caption-overlay window (shell/caption.rs), atomic serialized recordTranslation, audioIpc/captionIpc IPC wrappers, i18n vi+en. 205 Vitest pass, eslint+prettier clean, tsc clean. Rust not built locally (no MSVC/vcvars on host - CI builds Rust). | Active |
| 2026-07-10 | qa-test | Verified BOTH layers: vitest 205 passed / 0 failed, eslint+prettier clean, tsc clean; AND the new Rust caption window compiles - cargo fmt clean, clippy --all-targets -D warnings clean (44.55s). All ACs covered (overlay render + detected lang + low-confidence, keyboard controls, source/target Settings controls, whisper consent, audio:error no-raw-message, text-only + atomic history). No test added. | Green |
| 2026-07-10 | code-reviewer | PASS. PlainText anti-injection; audio:error shows localized msg never raw; names-only session request (IPC + window query, percent-encoded); atomic history write (writeChain) proven; audio caption recorded text-only; thin Rust command handlers, thiserror, no unwrap outside tests; design-system hard gate holds (no new primitive); i18n vi+en accented; master-plan only TASK-016 row. Nits: dead key caption.modelBlocked; overlay-close does not notify Settings running state (self-corrects) -> TASK-017. | PASS |
| 2026-07-10 | security-reviewer | PASS. No key/audio leaves via the session request or window (names-only, both paths verified); history text-only by construction (toEntry whitelist, smuggled fields dropped); caption-overlay window capability least-privilege (no fs/shell/http); captions via PlainText; copy-only, no auto-send. | PASS |
| 2026-07-10 | orchestrator | Merged PR #30 (merge commit 0b5d844); CI GREEN; secret-scan clean (503/secret-xyz are negative test fixtures). Closed: Done in frontmatter + board, moved to done/. Nits -> TASK-017. | Done |

## Result
The live caption overlay + FR-01 UI surface is on `main` (PR #30, merge commit 0b5d844).
FR-01 is now complete end to end (backend TASK-013/014/015 + this UI). Delivered: an
always-on-top `caption-overlay` window (src-tauri/src/shell/caption.rs, mirrors the region
window) + `CaptionOverlayView` that consumes the `audio:caption` event and renders bilingual
source+translated text (PlainText), a provider/model badge (AC-03.5), the detected source
language (AC-01.3), and a visible low-confidence flag (AC-01.7); pin/copy/dismiss/drag/opacity
all keyboard-operable and copy-only (AC-04.3/04.8). FR-01 Settings controls: source-language
pin (default Auto) + target-language (default vi) + whisper model selection and first-run
consent (reusing ConsentDialog for whisper-ggml) (AC-01.4/01.5/01.8). A start/stop audio-session
control (useAudioSession) makes it exercisable. Each completed caption is recorded to history
text-only (sessionType audio) via the recordTranslation seam, whose write is now ATOMIC
(serialized writeChain) so concurrent region+audio completions never drop an entry.

Gates: qa 205 frontend + the Rust caption window compiles clean under -D warnings; code-reviewer
PASS; security-reviewer PASS (no key/audio egress; history text-only; least-privilege window);
secret-scan clean; CI green.

Follow-ups (tracked -> TASK-017): emit an audio:stopped / window-close event so Settings'
running state stays in sync when the overlay is closed directly; wire (or drop) the dead
caption.modelBlocked i18n key.
