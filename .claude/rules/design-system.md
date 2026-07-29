---
paths:
  - "src/components/**/*.{ts,tsx}"
  - "src/views/**/*.{ts,tsx}"
  - "src/styles/**/*.css"
---

# Rule: Design system (HARD GATE)

Build UI ONLY from primitives in `src/components/ui/` and design tokens in
`src/styles/tokens.css`. The code-reviewer BLOCKS any diff that violates this contract.

## Tokens

CSS custom properties: color scales (dark-first), spacing scale, radii, typography, z-index
layers (overlay > toast > modal), opacity steps for overlay scrims. No hardcoded hex/px
values in components; no inline styles bypassing tokens.

## Primitives (to be created in Phase 1 - enumerate as they land)

Planned initial set: `Button`, `IconButton`, `Input`, `Select` (custom - native `<select>`
is banned), `Switch`, `Slider`, `Badge`, `Tooltip` (no raw `title=` attributes), `Card`,
`OverlayPanel` (the translation overlay surface), `DataList`. Each new primitive: create,
export from the barrel, test, and add a row here IN THE SAME PR.

Landed primitives:

| Primitive | Purpose |
|-----------|---------|
| `Dialog` | Modal surface (role="dialog", aria-modal, Esc/backdrop close, focus-on-open); used by the fail-closed model-download consent disclosure. |

### Landed

| Primitive | File | Purpose |
|-----------|------|---------|
| `Button` | `src/components/ui/Button.tsx` | Text button (default/primary variants) |
| `IconButton` | `src/components/ui/IconButton.tsx` | Icon-only button with mandatory `aria-label`; `pressed` for toggles |
| `Input` | `src/components/ui/Input.tsx` | Text/password field (only text-entry element); `password` masks + disables autocomplete for key entry |
| `Select` | `src/components/ui/Select.tsx` | Custom listbox select (native `<select>` banned); full keyboard nav |
| `Switch` | `src/components/ui/Switch.tsx` | `role="switch"` toggle, keyboard operable |
| `Slider` | `src/components/ui/Slider.tsx` | Token-styled range input (opacity control) |
| `Badge` | `src/components/ui/Badge.tsx` | Status badge (provider/model, low-confidence warning) |
| `Tooltip` | `src/components/ui/Tooltip.tsx` | Hover/focus tooltip linked via `aria-describedby` (raw `title=` banned) |
| `OverlayPanel` | `src/components/ui/OverlayPanel.tsx` | Translation overlay surface with user-adjustable scrim opacity |
| `PlainText` | `src/components/ui/PlainText.tsx` | Sanitizing plain-text renderer for untrusted OCR/transcript/translation output |
| `ProgressBar` | `src/components/ui/ProgressBar.tsx` | Determinate progress bar (STT model-download progress, TASK-026) |
| `Spinner` | `src/components/ui/Spinner.tsx` | Indeterminate loading indicator (streaming-translation-in-flight affordance) |
| `Tabs` | `src/components/ui/Tabs.tsx` | Keyboard-accessible tab group (`role="tablist"`/`tab`/`tabpanel`, arrow-key nav); groups the Settings view |
| `Textarea` | `src/components/ui/Textarea.tsx` | Multi-line paste/edit text field (region-preview pasteable source text) |
| `Flag` | `src/components/ui/Flag.tsx` | Secondary, decorative country-flag visual next to a language name in `Select` options (never flag-only; see the flag-SVG exception below) |
| `Popover` | `src/components/ui/Popover.tsx` | Compact overflow/disclosure surface (portaled, viewport-clamped) for secondary controls - the region/caption overlay "more options" affordance |
| `Disclosure` | `src/components/ui/Disclosure.tsx` | Progressive-disclosure toggle (`aria-expanded`/`aria-controls`) that reveals secondary/advanced content without unmounting it; used to collapse rarely-used Settings controls (TASK-034 IA pass) |

## Flag-SVG exception (owner-approved, TASK-030)

Language pickers show a country flag as a SECONDARY visual next to the language
name (which stays the primary label and the accessible name - never
flag-only). This is a narrow, written exception to the lucide-only icon
policy:

- Self-hosted SVG only, under `src/assets/flags/` (one file per ISO 3166-1
  alpha-2 country code); see the README there for source/license provenance.
- No emoji flags, ever. No CDN/external host, no runtime fetch, no npm
  dependency that pulls flag assets at build/run time - files are copied
  in-repo.
- Rendered via the `Flag` primitive (`aria-hidden`, decorative) and passed as
  the `icon` on a `Select` option; the option's `aria-label` stays pinned to
  the language name alone.

## Brand-SVG exception (owner-approved, visual redesign pass)

The app's own logo (the OST mark and its use next to the "OST"/window-title text as a
compact wordmark) is a second, narrow, written exception to the lucide-only icon policy, in
the same shape as the flag-SVG exception above:

- Self-hosted SVG only, under `src/assets/brand/` (currently `mark.svg`); see the README
  there for the concept and color provenance. No CDN/external host, no runtime fetch, no npm
  dependency that pulls brand assets at build/run time.
- Original artwork - simple geometry, no gradients, no text baked into the glyph - so it
  reads from a 16px tray icon up to a 1024px installer icon.
- Rendered via the `BrandMark` component (`src/components/BrandMark.tsx`, `alt=""` /
  `aria-hidden`, decorative) placed as a SIBLING of the heading text it sits beside, never a
  wrapper around it - the accessible name for "this is OST" stays carried by that text
  (`app.title` / `settings.title` / `history.title`), never by the image alone.
- The SAME source file is the input to `npx tauri icon src/assets/brand/mark.svg`, which
  regenerates the native icon set in `src-tauri/icons/` (window/taskbar/tray/installer icons)
  - an asset-only regeneration, not a change to Rust window/tray behavior.

## Banned outright

- Native `<select>`, raw data `<table>` (use the DataList/table primitive when it exists).
- Hardcoded colors/spacing, inline style token bypasses.
- Raw `title=` attributes (use Tooltip).
- Emoji as icons (lucide-react SVG only).

## LLM output rendering

Translated/transcribed text renders through a sanitizing plain-text renderer: never
`dangerouslySetInnerHTML`, never markdown-interpret provider output.
