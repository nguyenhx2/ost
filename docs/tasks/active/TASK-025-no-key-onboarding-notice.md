---
title: "TASK-025: No-API-key onboarding notice on translation surfaces"
status: Active
fr: FR-04
owner: frontend-ui-dev
deps: TASK-009
priority: P1
phase: 3
created: 2026-07-11
tags: [task]
---

# TASK-025: No-API-key onboarding notice on translation surfaces

## Goal
When no provider has a key configured (zero keys), every translation surface shows a clear, actionable "configure a key first" notice with a one-click affordance to open Settings, distinct from the generic "translation failed" message which is reserved for real failures.

## Inputs / context
- Related FR: [FR-04](../../specs/05-functional-requirements.md#fr-04) (+ FR-03 provider transparency)
- Rules: human-in-the-loop.md (provider transparency), frontend.md (i18n vi+en)
- Related files/modules: src/views/RegionPreviewView.tsx (+css), src/views/CaptionOverlayView.tsx (+css), src/hooks/useProviderKeys.ts (statuses map: {provider_id, key_present}), src/lib/i18n/translations.ts, src/lib/ipc.ts (keysIpc.statuses)
- Detection signal: keysIpc.statuses() returns ProviderKeyStatus[] with key_present per provider; zero keys = every key_present false. Never read the key itself, only masked status.

## To do
- [ ] Detect the "no key configured" state (all key_present false) on translation surfaces.
- [ ] Render a distinct notice (not the failure message) with an "open Settings" one-click affordance.
- [ ] i18n keys for vi + en (Vietnamese fully accented).
- [ ] Keep the generic "translation failed" message only for real failures.

## Test scenarios / acceptance
- [ ] Zero keys -> the actionable no-key notice with open-Settings affordance renders on region preview and caption overlay.
- [ ] At least one key present + real failure -> the generic "translation failed" message renders (not the no-key notice).
- [ ] Both states covered by tests (Vitest).
- [ ] Design-system hard gate; tokens + primitives only.
- [ ] npm run lint and npm run test pass locally; CI lint-and-test green on the PR.

## Orchestration notes
- security-reviewer required: touches the key-status read path (must confirm no key value ever crosses into the WebView beyond masked presence).

## Session log (AI session log)

| Date | Who | What was done | Result |
|------|-----|---------------|--------|
| 2026-07-11 | orchestrator | Registered task; dispatch after TASK-024 merges (shared translation-surface files) | pending |

## Result
<Fill when moving to Done; link the PR/commit.>
