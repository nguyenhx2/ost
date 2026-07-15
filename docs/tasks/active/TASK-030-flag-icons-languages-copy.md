---
title: "TASK-030: Flag icons, more languages, copy controls on translation UI"
status: Active # Active | Blocked | Pending | Done (Planned before dispatch)
fr: FR-04
owner: frontend-ui-dev
deps: TASK-008, TASK-016
priority: P1
phase: 3
created: 2026-07-15
tags: [task]
---

<!-- TASK FILES ARE WRITTEN 100% IN ENGLISH (see .claude/rules/task-tracking.md). -->

# TASK-030: Flag icons, more languages, copy controls on translation UI

## Goal
Add self-hosted SVG flag icons to the language pickers, expand the source/target
language option lists, and ensure both source and translation carry a visible copy
control on the region preview AND the caption overlay.

## Inputs / context
- Related FR: [FR-04](../../specs/05-functional-requirements.md#fr-04)
- Related files/modules: `src/lib/languages.ts`, `src/lib/i18n/translations.ts`,
  `src/components/ui/Select.tsx`, `src/views/RegionPreviewView.tsx`,
  `src/views/CaptionOverlayView.tsx`, `src/views/RegionSelectView.tsx`,
  `src/views/SettingsView.tsx`, `src/App.tsx`, new flag SVG assets under
  `src/assets/flags/`, `.claude/rules/design-system.md` (flag-SVG exception note).

## To do
- [ ] Self-host a curated SVG flag set (one per needed country) under
      `src/assets/flags/`; NO emoji flags, NO CDN/external host.
- [ ] Render a flag beside each language in the pickers - name stays primary label,
      flag is secondary visual with alt/aria; never flag-only.
- [ ] Document the flag-SVG exception in `.claude/rules/design-system.md` (same PR).
- [ ] Expand SOURCE_LANGUAGE_OPTIONS / TARGET_LANGUAGE_OPTIONS with the major
      translation languages; source keeps Auto-detect, target has no auto.
- [ ] i18n vi+en label keys for every added language (vi fully accented).
- [ ] Verify source + translation copy controls render on region preview AND caption
      overlay; surface any hook-only copy that is not shown.

## Test scenarios / acceptance
- [ ] Language lists include the new codes; each has an i18n label (vi+en).
- [ ] Flag renders with alt text and the language name label (never flag-only).
- [ ] Copy fires the clipboard IPC for source and translation on both the region
      preview and the caption overlay, with aria-live "copied" feedback.
- [ ] OCR fidelity / Degraded behavior for the vi charset is unchanged.
- [ ] `npm run test` + `npm run lint` green; prettier clean.

## Orchestration notes
- Design-system extension: flags add a NEW icon-asset category outside the
  lucide-only policy. Owner pre-approved for this request on condition it is written
  into design-system.md (not silent). Flag emoji remain BANNED.
- Copy controls already render on both surfaces (RegionPreviewView copySource +
  copyTranslation; CaptionOverlayView copyTranslation + copySource) - item 3 is
  mainly verify + test.

## Session log (AI session log)

| Date | Who | What was done | Result |
|------|-----|---------------|--------|
| 2026-07-15 | orchestrator | Registered task; scoped flags/languages/copy; dispatched frontend-ui-dev | In progress |
| 2026-07-15 | frontend-ui-dev | Self-hosted 15 MIT-licensed flag-icons SVGs under `src/assets/flags/`; added `Flag` primitive + `Select.icon`; expanded source/target language catalogs to 15 codes with en+vi i18n; added a `languageSelectOptions` helper and wired it into all 4 picker call sites; verified copy-source/copy-translation already render on both the region preview and caption overlay and added coverage; documented the flag-SVG exception in design-system.md; full `npm run test` (405/405) + `npm run lint` + prettier green. Branch `feat/flag-icons-languages-copy`, not yet merged. | In progress |

## Result
<Fill when moving to Done; link the PR/commit. Then move the file to docs/tasks/done/.>
