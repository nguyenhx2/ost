# OST brand mark - provenance

Original artwork, created for this project (TASK visual redesign pass). Not sourced from
any external icon set, template, or generator - self-hosted only, in-repo, no CDN/runtime
fetch (design-system.md brand-SVG exception).

## Concept

Two offset, rounded caption bars - the source line, and beneath it, larger and bolder, the
translated line - the same shape the app's own overlays render (source text above,
translated text below). The field behind them is the exact accent blue the app already uses
for the region-selection highlight (`--color-selection-border` / `--color-accent` in
`src/styles/tokens.css`), so the mark reuses a color that already means "this is what OST
captures/selects" inside the product itself, rather than inventing a new brand color.

Fixed, hardcoded fill colors (not CSS custom properties) are intentional: this is a static
raster-source asset baked into the native app icon (tray, taskbar, installer) via
`npx tauri icon`, which must render correctly outside the themed WebView, independent of the
user's dark/light theme setting.

| Fill | Hex | Matches token |
|------|-----|----------------|
| Background field | `#8ab4f8` | `--color-accent` / `--color-selection-border` (dark theme) |
| Source-line bar | `#232733` | `--color-surface-raised` (dark theme) |
| Translated-line bar | `#0f1115` | `--color-bg` (dark theme) |

## Files

- `mark.svg` - the app mark. Simple geometry (two rounded rectangles on a solid field), no
  gradients, no text in the glyph - legible from a 16px tray icon up to a 1024px installer
  icon. Source for `npx tauri icon src/assets/brand/mark.svg`, which regenerates the full
  `src-tauri/icons/` set (window/taskbar/tray/installer icons).

## License

Original work for the OST project; no third-party license applies.
