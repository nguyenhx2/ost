# Rule: Frontend

## Brand assets (MANDATORY section - currently placeholder)

No official brand assets yet. When they exist: record the asset table here (logo variants
per background - light logo for dark backgrounds and vice versa), self-host under
`public/brand/`, respect aspect ratio/clear space, always provide alt text. Until then, use
the plain app name "OST" as text; do not invent logos.

## Icons and writing

- Icon policy: NO emoji anywhere in the UI. SVG icons only, via `lucide-react`.
- UI copy: Vietnamese and English via i18n keys from day one (`src/lib/i18n/`); no
  hardcoded user-facing strings in components. Vietnamese strings fully accented.

## Theme

- Dark-first: the overlay and tray app default to dark theme; light theme supported through
  the same tokens. Never hardcode colors - tokens only (design-system.md).
- Overlay windows must be legible over arbitrary backgrounds: token-defined scrim/contrast
  layer, user-adjustable opacity.

## Accessibility

- Target WCAG 2.1 AA: contrast >= 4.5:1 for text, full keyboard operability (overlay
  dismiss/pin/copy without mouse), focus states visible, aria-labels on icon buttons,
  reduced-motion respected.

## AI-output UI (human-in-the-loop.md)

- Translations are proposals: show source + translated text, provider/model badge, a copy
  control, and an easy correction/re-translate affordance. Low-confidence STT segments are
  visually flagged.

## Structure

- Components pure-UI; logic in hooks/`src/lib/`; IPC only through the typed wrapper.
- State: keep it minimal (React state + context); introduce a store library only via ADR.
