---
title: "TASK-018: Translation history (BR-06)"
status: Done
fr: "FR-04"
owner: frontend-ui-dev
deps: "TASK-009"
priority: P1
phase: 3
created: 2026-07-10
tags: [task]
---

<!-- TASK FILES ARE WRITTEN 100% IN ENGLISH (see .claude/rules/task-tracking.md). -->

# TASK-018: Translation history (BR-06)

## Goal
Store completed translations text-only and local, on by default, with a visible clear-all, a disable toggle and a history view.

## Inputs / context
- Related FR: [FR-04](../../specs/05-functional-requirements.md#fr-04); BR-06; the HISTORY_ENTRY data dictionary.
- Related files: `src/` history view, the history store (text-only), `src-tauri/src/commands/`.

## To do
- [x] History store: text-only fields per HISTORY_ENTRY (source/translated text, langs, provider/model, session type, timestamp) - NEVER keys, audio, or screenshots (AC-04.4).
- [x] ON by default (BR-06); a history view lists entries with copy.
- [x] Clear-all control always visible, with confirm, wipes the store (AC-04.5).
- [x] Disable toggle in Settings stops recording; re-enable resumes (AC-04.6); i18n; Vitest.

## Test scenarios / acceptance
- [ ] AC-04.4 text-only fields, no key/audio/screenshot; AC-04.5 clear-all; AC-04.6 disable toggle.
- [ ] security-reviewer confirms no sensitive data in the store.

## Orchestration notes
- BR-06 on by default (owner decision 2026-07-09).

## Session log (AI session log)

| Date | Who | What was done | Result |
|------|-----|---------------|--------|
| 2026-07-10 | orchestrator | Task created and registered in master-plan (Phase B decomposition) | Planned |
| 2026-07-10 | frontend-ui-dev | Flip status Planned -> Active; start frontend-first history store (tauri-plugin-store) | Active |
| 2026-07-10 | frontend-ui-dev | Frontend-only impl: text-only history store lib (`src/lib/history.ts`), `useHistory`/`useHistorySettings` hooks, `HistoryView` (list+copy+clear-all confirm), Settings disable toggle, recording seam in `useRegionPreview` (region path; audio seam documented), i18n vi/en. TDD: 178 tests pass, lint clean, tsc clean. No Rust touched | Active |
| 2026-07-10 | qa-test | Verified: vitest 178 passed / 0 failed, eslint+prettier clean, tsc clean. AC-04.4 text-only gate (drops smuggled key/audio/screenshot; exact 9-field set), AC-04.5 clear-all+confirm, AC-04.6 disable toggle + ON-by-default all covered. No test added. | Green |
| 2026-07-10 | code-reviewer | PASS. PlainText for untrusted text, store via typed lib (no scattered invoke), copy-only, clear-all behind confirm Dialog, tokens/primitives, i18n vi+en, master-plan only TASK-018 row, zero Rust. Should-fix: useHistory.refresh unused (open window will not live-update) - tracked to TASK-017. Nits: non-atomic record write (track for TASK-015/016), '1 entries' grammar. | PASS |
| 2026-07-10 | security-reviewer | PASS. History text-only BY CONSTRUCTION (toEntry reads only the 9 named HISTORY_ENTRY fields, never spreads input) - no key/audio/screenshot can enter; persisted keys are entries+enabled only; data never leaves the machine (local tauri-plugin-store; copy-only clipboard); untrusted text via PlainText; no key/PII in logs. | PASS |
| 2026-07-10 | orchestrator | Merged PR #23 (merge commit 31a3429); CI green; secret-scan clean (synthetic sk- string is a negative-test fixture only). Closed: status Done in frontmatter + board, moved to done/. Follow-ups tracked. | Done |

## Result
Translation history (BR-06) is on `main` (PR #23, merge commit 31a3429), frontend-only (zero
Rust). A text-only local history via `tauri-plugin-store` (`src/lib/history.ts`): `toEntry`
builds each record from only the 9 HISTORY_ENTRY fields (source/translated text, source/target
language, provider id, model id, session type, id, timestamp) and never spreads caller input,
so a key/audio/screenshot cannot enter the store. History is ON by default; a `HistoryView`
lists entries with per-entry copy (copy-only, no auto-outbound); an always-visible clear-all
behind a confirm `Dialog` wipes the store; a Settings disable toggle stops/resumes recording.
The region-translate completion path records via a documented `recordTranslation` seam; the
audio-caption path (TASK-015/016) reuses the same helper.

Acceptance: AC-04.4 text-only field set (proven: history.test.ts drops smuggled
key/audio/screenshot), AC-04.5 clear-all with confirm, AC-04.6 disable toggle + ON-by-default.
Gates: qa-test 178 passed; code-reviewer PASS; security-reviewer PASS (never leaves the
machine); secret-scan clean; CI green.

Follow-ups (tracked, NOT done here):
- Wire `useHistory.refresh` (store-change/focus) so an already-open History window live-updates,
  AND add the "Lich su" tray menu item + `open_history_window` (index.html?view=history) so the
  view is reachable per AC-04.2 - both fold into TASK-017 (tray/hotkeys, Rust shell).
- Make `recordTranslation` write atomic (read-modify-write) before the audio path also records
  concurrently - fold into TASK-015/016.
- Target-language default is hardcoded "vi" pending the target picker (AC-01.5/target selection UI).
