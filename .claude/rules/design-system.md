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

## Banned outright

- Native `<select>`, raw data `<table>` (use the DataList/table primitive when it exists).
- Hardcoded colors/spacing, inline style token bypasses.
- Raw `title=` attributes (use Tooltip).
- Emoji as icons (lucide-react SVG only).

## LLM output rendering

Translated/transcribed text renders through a sanitizing plain-text renderer: never
`dangerouslySetInnerHTML`, never markdown-interpret provider output.
