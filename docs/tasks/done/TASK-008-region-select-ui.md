---
title: "TASK-008: Region-select overlay + translation preview UI"
status: Done
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
- [x] Fullscreen dimmed selection overlay window (esc to cancel, drag to select,
      pixel-coords via IPC).
- [x] Preview `OverlayPanel`: source text -> translated text, provider/model badge, copy,
      pin, re-translate, close; low-confidence markers.
- [x] Global hotkey + tray menu entry to start selection (`src-tauri/src/shell/`).
- [x] i18n keys (vi + en) for all strings; Vitest for hooks with mocked IPC.

## Test scenarios / acceptance
- [x] Full flow works against a mocked pipeline (fake events) without TASK-007.
- [x] Keyboard-only operation possible (WCAG 2.1 AA path).
- [x] No design-system violations (code-reviewer hard gate).

## Session log (AI session log)

| Date | Who | What was done | Result |
|------|-----|---------------|--------|
| 2026-07-09 | orchestrator | Task created and registered in master-plan (bootstrap seed) | Planned |
| 2026-07-09 | orchestrator | worktree+branch feat/region-select-ui created off 525ba51; dispatched spec-guardian for FR-02/FR-04 UI spec lock | Active |
| 2026-07-09 | frontend-ui-dev | committed WIP checkpoint; rebased feat/region-select-ui onto main (fda5f99) - no conflicts; renormalized eol=lf | Rebased, tree clean |
| 2026-07-09 | frontend-ui-dev | added Landed primitives table to design-system.md (Button, IconButton, Select, Switch, Slider, Badge, Tooltip, OverlayPanel, PlainText) | Design-system rows recorded |
| 2026-07-09 | frontend-ui-dev | fixed Rust shell build: made global-shortcut plugin and open_selection_window generic over Runtime; cargo fmt | cargo test shell 10/10, clippy -D warnings clean |
| 2026-07-09 | frontend-ui-dev | verified gates: npm lint clean, vitest 75/75, tsc+vite build ok; design-system self-audit clean (no banned elements/hardcoded values) | All green |
| 2026-07-09 | frontend-ui-dev | fix round: added "failed" preview status + translation timeout (TRANSLATION_TIMEOUT_MS=8000, headroom over NFR-PERF-02); new IPC event region:translation-error (EVENT_REGION_TRANSLATION_ERROR / EVENT_TRANSLATION_ERROR) + TranslationErrorPayload; failed/timeout UI (role=alert, i18n, re-translate escape hatch) honoring BR-05; vi/en error+timeout i18n keys; wired mock error path via [[fail]] sentinel | Failure/timeout path closed |
| 2026-07-09 | frontend-ui-dev | created docs/architecture/api-contracts/ipc.md (region commands+events incl. translation-error); resolved keep-in-sync refs in ipc.ts:11 and region.rs:15; nits: vi "text"->"văn bản", IconButton Omit style | Contract doc landed |
| 2026-07-09 | frontend-ui-dev | verified: npm lint clean, vitest 82/82, tsc+vite build ok; cargo fmt+clippy -D warnings clean, cargo test --lib shell 11/11; squashed wip checkpoint into clean conventional commits, rebased on main (fda5f99) | All green, PR-ready |

## Result
<Fill when moving to Done.>
| 2026-07-09 | claude | Rebased onto main after PR #2 merged; resolved Cargo.toml conflict by unioning both dependency sets, de-duplicating thiserror (kept the pinned 2.0.12) and pinning the two tauri plugins to 2.3.2 per tech-stack.md; regenerated Cargo.lock | Done |
| 2026-07-09 | claude | Re-verified post-rebase: cargo test 67 passed (56 provider + 11 shell, confirming the rebase dropped no code), vitest 82/82, clippy -D warnings clean, prettier clean. CI green. PR #3 merged to main (5c55b54) | Done |

## Result
Region-select overlay and translation preview UI are on `main` (PR #3, merge commit
5c55b54).

Delivered: the fullscreen dimmed selection overlay (drag and keyboard driven, pixel coords
over the typed IPC wrapper); the preview `OverlayPanel` (source -> translation, provider and
model badge, copy / pin / re-translate / close, low-confidence marker, opacity and
live-update controls); global hotkey and tray entry; nine UI primitives, each with a row in
`.claude/rules/design-system.md`; i18n from day one (vi fully accented + en); the sanitizing
plain-text renderer for untrusted output; and a translation failure/timeout state
(`region:translation-error` + `TRANSLATION_TIMEOUT_MS`) so a stalled provider call surfaces
instead of hanging silently. The region IPC contract is in
`docs/architecture/api-contracts/ipc.md`.

Evidence: vitest 82/82 (including 7 failure-path tests); `cargo test --lib` 11/11 for
`shell::region`; lint, frontend build, clippy and fmt clean; CI `lint-and-test` green on
PR #3. code-reviewer PASS on the design-system hard gate (no native `<select>`, no raw
`title=`, no hardcoded hex/px, no `dangerouslySetInnerHTML`, no emoji, least-privilege
capabilities, IPC only through the typed wrapper). qa-test PASS.

Carried forward, not done here:
- The whole flow runs against a mocked pipeline. It is wired to real capture/OCR only when
  TASK-007 lands, and the preview surface is what TASK-007's spike will render into.
- Keyboard-only operation is unit-tested but not yet covered by a WCAG audit or an e2e
  run; tauri-driver e2e remains deferred (known-issues).

