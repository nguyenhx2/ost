# OST brand mark - provenance

Original artwork, created for this project (TASK visual redesign pass). Not sourced from
any external icon set, template, or generator - self-hosted only, in-repo, no CDN/runtime
fetch (design-system.md brand-SVG exception).

## Concept

Four accent-blue waveform bars of varying height, resolving into two off-white horizontal
caption bars, on a dark rounded field - sound becoming text, the app's own pipeline (system
audio and screen capture -> recognition -> translation, rendered as caption-style overlay
proposals).

This mark was chosen over three other candidates specifically for legibility at native tray/
taskbar sizes: it is the only concept that stays fully readable at both 16px and 32px while
keeping a balanced silhouette. An earlier two-bar "source line / translated line" concept was
rejected at the 32px review - both bars rendered near-black on a hard-edged accent-blue
square, so the intended light/dark distinction between the two lines was invisible at tray
size and the unrounded field read as unfinished.

Fixed, hardcoded fill colors (not CSS custom properties) are intentional: this is a static
raster-source asset baked into the native app icon (tray, taskbar, installer) via
`npx tauri icon`, which must render correctly outside the themed WebView, independent of the
user's dark/light theme setting.

| Fill | Hex | Matches token |
|------|-----|----------------|
| Background field | `#0f1115` | `--color-bg` (dark theme) |
| Waveform bars | `#8ab4f8` | `--color-accent` / `--color-selection-border` (dark theme) |
| Caption bars | `#eef1f7` | close to `--color-text` (dark theme); kept slightly off-white for contrast against the waveform blue |

## Files

- `mark.svg` - the app mark. Simple geometry (rounded bars on a solid rounded field), no
  gradients, no text in the glyph - legible from a 16px tray icon up to a 1024px installer
  icon. Source for `npx tauri icon src/assets/brand/mark.svg`, which regenerates the full
  `src-tauri/icons/` set (window/taskbar/tray/installer icons).

## License

Original work for the OST project; no third-party license applies.
