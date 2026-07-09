---
title: "TASK-009: Settings UI - provider key entry/validation, model selection"
status: Planned
fr: "FR-03, FR-04"
owner: frontend-ui-dev
deps: "TASK-006"
priority: P1
phase: 1
created: 2026-07-09
tags: [task]
---

# TASK-009: Settings UI - provider key entry/validation, model selection

## Goal
Users can add/validate/remove API keys for the four providers, pick default provider +
model, and set fallback order - keys stored via TASK-006's keychain wrapper only.

## Inputs / context
- FR-03 spec; ADR-003; `security-privacy.md` (WebView never sees key values after entry);
  `human-in-the-loop.md` (provider transparency).

## To do
- [ ] Settings window: provider list with masked status, add-key flow (paste -> validate
      via provider `validate_key` -> store -> clear input), remove-key flow.
- [ ] Default provider/model selection + fallback order (persisted in tauri-plugin-store -
      names only, never keys).
- [ ] Clear error surfaces for invalid key / quota / network (typed errors from the
      provider layer).
- [ ] i18n vi+en; Vitest with mocked IPC.

## Test scenarios / acceptance
- [ ] After entry, the key value is unreachable from the WebView (assert IPC surface).
- [ ] Invalid key shows a specific, actionable message.

## Session log (AI session log)

| Date | Who | What was done | Result |
|------|-----|---------------|--------|
| 2026-07-09 | orchestrator | Task created and registered in master-plan (bootstrap seed) | Planned |

## Result
<Fill when moving to Done.>
