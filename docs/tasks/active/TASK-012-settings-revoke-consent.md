---
title: "TASK-012: Settings revoke-consent control for model downloads"
status: Planned
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

## Test scenarios / acceptance
- [ ] Consent is revocable in Settings (security-privacy / BR-09).
- [ ] Revoke clears the persisted consent; the next model download re-prompts.
- [ ] No key or secret on the IPC surface.

## Orchestration notes
- Small UI follow-up; frontend-only, reuses the existing IPC wrapper.

## Session log (AI session log)

| Date | Who | What was done | Result |
|------|-----|---------------|--------|
| 2026-07-10 | orchestrator | Task created and registered in master-plan (Phase B decomposition) | Planned |

## Result
<Fill when moving to Done; link the PR/commit. Then move the file to docs/tasks/done/.>
