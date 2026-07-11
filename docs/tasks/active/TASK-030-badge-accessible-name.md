---
title: "TASK-030: Fix Badge accessible name hiding the value from assistive tech"
status: Active
fr: FR-04
owner: frontend-ui-dev
deps: TASK-028
priority: P1
phase: 3
created: 2026-07-11
tags: [task]
---

<!-- TASK FILES ARE WRITTEN 100% IN ENGLISH (see .claude/rules/task-tracking.md). -->

# TASK-030: Fix Badge accessible name hiding the value from assistive tech

## Goal

Fix Badge component accessibility: ensure that badge values (like "gemini-2.5-flash") are announced to assistive tech alongside their context labels (like "Provider"), rather than being silently replaced in the accessibility tree.

## Inputs / context

- Related component: `src/components/ui/Badge.tsx`
- Related rule: `.claude/rules/design-system.md` (primitives-and-tokens contract)
- Related rule: `.claude/rules/frontend.md` (accessibility target WCAG 2.1 AA)
- Found during code review in TASK-028 (main-window home screen)
- Affected call sites (17 with `label=`):
  - `src/App.tsx`: provider/model badge, key status badge, STT tier badge, hotkeys badge, audio-running badge
  - `src/views/SettingsView.tsx`: STT downloaded badge, hotkey binding badge, model allowed badge, audio model ready badge, audio running badge, fallback-no-key badge
  - `src/views/CaptionOverlayView.tsx`: provider badge
  - `src/views/RegionPreviewView.tsx`: provider badge
  - `src/views/HistoryView.tsx`: session badge (note: this one passes `label` identical to child text, a double-announce trap)

## To do

- [ ] Audit Badge implementation: confirm that `aria-label` on a generic span replaces child text in accessibility tree
- [ ] Design accessible name pattern: badge must announce both label and value without duplication
- [ ] Update Badge component to use accessible name strategy (e.g., aria-labelledby + aria-description, or restructured element semantics)
- [ ] Add unit tests asserting accessible name includes the badge value
- [ ] Audit and update all 17 call sites to match the new pattern
- [ ] Verify no visual change and design-system compliance (primitives + tokens only, no hardcoded values, no emoji)
- [ ] Verify WCAG 2.1 AA compliance on all updated badge instances

## Test scenarios / acceptance

- [ ] Badge accessible name includes BOTH its context label and its visible value
- [ ] No badge announces its label while dropping the visible value
- [ ] No duplicate or stuttered announcement when label text equals the child text (HistoryView case)
- [ ] Zero visual change to the badge rendering (a11y-only fix)
- [ ] Badge component has unit tests asserting the accessible name contains the badge value
- [ ] All 17 call sites verified to announce correctly via a screen reader
- [ ] Design-system rules hold: primitives + tokens only, no hardcoded hex/px values, no emoji, WCAG 2.1 AA target met
- [ ] Tests pass: `npm run test` (Vitest)

## Orchestration notes

- This is a fix to a pre-existing pattern; it affects call sites across multiple views
- HistoryView's identical-label-and-child case requires special attention to avoid stuttering
- No changes to Badge API surface; backward compatible

## Session log (AI session log)

| Date | Who | What was done | Result |
|------|-----|---------------|--------|
| 2026-07-11 | orchestrator | Task registered from owner follow-up mission (Badge a11y) | Registered |

## Result

<Fill when moving to Done; link the PR/commit. Then move the file to docs/tasks/done/.>
