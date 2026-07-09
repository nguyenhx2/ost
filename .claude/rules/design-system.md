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

## Banned outright

- Native `<select>`, raw data `<table>` (use the DataList/table primitive when it exists).
- Hardcoded colors/spacing, inline style token bypasses.
- Raw `title=` attributes (use Tooltip).
- Emoji as icons (lucide-react SVG only).

## LLM output rendering

Translated/transcribed text renders through a sanitizing plain-text renderer: never
`dangerouslySetInnerHTML`, never markdown-interpret provider output.
