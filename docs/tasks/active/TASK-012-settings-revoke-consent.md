---
title: "TASK-012: Settings revoke-consent control for model downloads"
status: Active
fr: "FR-02, FR-04"
owner: frontend-ui-dev
deps: "TASK-007, TASK-009"
priority: P1
phase: 1
created: 2026-07-10
tags: [task]
---

<!-- TASK FILES ARE WRITTEN 100% IN ENGLISH (see .claude/rules/task-tracking.md). -->

# TASK-012: Settings revoke-consent control for model downloads

## Goal
Wire the deferred revoke-consent control into the Settings view so users can revoke a previously granted model-download consent.

## Inputs / context
- Related FR: [FR-02](../../specs/05-functional-requirements.md#fr-02) (model-download consent), FR-04 (Settings).
- Related files: `src/` SettingsView, `src/lib/ipc.ts` (`modelIpc.revokeConsent` already implemented, with a TODO marker next to it).
- Deferred out of TASK-007 because it needed the TASK-009 SettingsView, now on main.

## To do
- [ ] Settings section listing consented model sets with a revoke action wired to `modelIpc.revokeConsent`.
- [ ] After revoke, the next download re-prompts consent (fail-closed preserved).
- [ ] i18n vi+en (accented); Vitest with mocked IPC.
- [ ] Primitives + tokens only; keyboard-operable with aria-label on the revoke control (frontend.md, design-system.md).

## Test scenarios / acceptance
- [ ] Consent is revocable in Settings (security-privacy consent facility / BR-08 model-download consent; this is the counterpart to the fail-closed download gate, NOT cloud OCR BR-09).
- [ ] Revoke clears the persisted consent; the next model download re-prompts.
- [ ] No key or secret on the IPC surface.

## Orchestration notes
- Small UI follow-up; frontend-only, reuses the existing IPC wrapper.

## Session log (AI session log)

| Date | Who | What was done | Result |
|------|-----|---------------|--------|
| 2026-07-10 | orchestrator | Task created and registered in master-plan (Phase B decomposition) | Planned |
| 2026-07-10 | spec-guardian | Pre-dispatch scope check. ALIGNED. Fixed BR-09->BR-08 citation (model-download consent, not cloud OCR); added a11y/primitives requirement. | Go |
| 2026-07-10 | frontend-ui-dev | Flipped status Planned->Active (task file + master-plan row). Starting TDD. | Active |
| 2026-07-10 | frontend-ui-dev | TDD: added useModelConsent hook + Settings "Model downloads" section listing granted sets with an aria-labelled revoke IconButton wired to modelIpc.revokeConsent. i18n vi+en keys. Vitest (mocked IPC) covers revoke command call, list reflects consent status, empty state, fail-closed on error, no key/secret on surface. Frontend-only; no Rust touched. test 149 pass, lint clean, tsc clean. | Green |

## Result
<Fill when moving to Done; link the PR/commit. Then move the file to docs/tasks/done/.>
