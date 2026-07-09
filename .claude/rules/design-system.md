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

Landed primitives (`src/components/ui/`):

| Primitive | File | Notes |
|-----------|------|-------|
| `Badge` | `Badge.tsx` | Status/provider badge; `warning` variant. |
| `Button` | `Button.tsx` | Text button; `primary` variant. |
| `IconButton` | `IconButton.tsx` | Icon-only, mandatory `label` (aria-label); lucide SVG children. |
| `Input` | `Input.tsx` | Text/password field (only text-entry element); `password` masks + disables autocomplete for key entry. |
| `OverlayPanel` | `OverlayPanel.tsx` | Translation overlay surface with token scrim. |
| `PlainText` | `PlainText.tsx` | Sanitizing plain-text renderer for provider output. |
| `Select` | `Select.tsx` | Custom listbox (native `<select>` banned); full keyboard nav. |
| `Slider` | `Slider.tsx` | Range input (overlay opacity). |
| `Switch` | `Switch.tsx` | `role="switch"` toggle. |
| `Tooltip` | `Tooltip.tsx` | Hover/focus tooltip (raw `title=` banned). |

### Landed

| Primitive | File | Purpose |
|-----------|------|---------|
| `Button` | `src/components/ui/Button.tsx` | Text button (default/primary variants) |
| `IconButton` | `src/components/ui/IconButton.tsx` | Icon-only button with mandatory `aria-label`; `pressed` for toggles |
| `Select` | `src/components/ui/Select.tsx` | Custom listbox select (native `<select>` banned); full keyboard nav |
| `Switch` | `src/components/ui/Switch.tsx` | `role="switch"` toggle, keyboard operable |
| `Slider` | `src/components/ui/Slider.tsx` | Token-styled range input (opacity control) |
| `Badge` | `src/components/ui/Badge.tsx` | Status badge (provider/model, low-confidence warning) |
| `Tooltip` | `src/components/ui/Tooltip.tsx` | Hover/focus tooltip linked via `aria-describedby` (raw `title=` banned) |
| `OverlayPanel` | `src/components/ui/OverlayPanel.tsx` | Translation overlay surface with user-adjustable scrim opacity |
| `PlainText` | `src/components/ui/PlainText.tsx` | Sanitizing plain-text renderer for untrusted OCR/transcript/translation output |

## Banned outright

- Native `<select>`, raw data `<table>` (use the DataList/table primitive when it exists).
- Hardcoded colors/spacing, inline style token bypasses.
- Raw `title=` attributes (use Tooltip).
- Emoji as icons (lucide-react SVG only).

## LLM output rendering

Translated/transcribed text renders through a sanitizing plain-text renderer: never
`dangerouslySetInnerHTML`, never markdown-interpret provider output.
