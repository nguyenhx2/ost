---
title: "TASK-012: Settings revoke-consent control for model downloads"
status: Done
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
| 2026-07-10 | qa-test | Independently verified suite: vitest 149 passed / 0 failed (19 files), eslint+prettier clean, tsc clean. All 3 ACs covered (revoke sends only modelSetId, revoked state re-prompts, failed revoke keeps granted). No test added (coverage complete). | Green |
| 2026-07-10 | code-reviewer | Full-diff gate. Design-system HARD GATE holds (primitives/tokens, lucide, no native controls); TS strict, logic in hook, IPC via typed wrapper; master-plan edits only the TASK-012 row; disclosure via PlainText; aria-labelled keyboard revoke. 2 nits only. | PASS |
| 2026-07-10 | security-reviewer | Model-download consent gate. Fail-closed Rust gate preserved (UI only flips persisted flag; ensure_download_allowed authoritative); revoke IPC carries only modelSetId; no key/secret on IPC surface; disclosure rendered plain-text. | PASS |
| 2026-07-10 | orchestrator | Merged PR #16 (merge commit f648800); secret-scan clean; CI lint-and-test green. Closed: status Done in frontmatter + board, moved to done/. | Done |

## Result
Settings revoke-consent control for model downloads is on `main` (PR #16, merge commit
f648800). Frontend-only: a `useModelConsent` hook + a "Model downloads" section in
SettingsView listing consented model sets, each with an aria-labelled revoke `IconButton`
wired to the existing `modelIpc.revokeConsent` (carries only `modelSetId`). Revoke flips
the persisted consent flag; the Rust fail-closed download gate stays authoritative, so the
next download re-prompts. i18n vi (accented) + en; primitives/tokens only; disclosure
fields rendered as plain text. Gates: qa-test 149 passed, code-reviewer PASS,
security-reviewer PASS (fail-closed preserved), secret-scan clean, CI green.
