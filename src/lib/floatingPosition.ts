/**
 * Shared viewport-clamping math for portaled floating UI (Tooltip listbox
 * options, the Select listbox). Both primitives render into `document.body`
 * so they escape any `overflow: hidden` ancestor (the overlay panel clips its
 * own scroll body - see `RegionPreviewView.css`), then use this helper to
 * keep the floating element fully on-screen instead of being cut off by the
 * small overlay windows' edges (owner complaint, design-system.md primitives
 * Tooltip/Select).
 */

/** Fallback gutter (px) if the CSS custom property cannot be read (e.g. in a
 * non-browser test environment). Kept at 0 so the ONLY source of truth for
 * the real gutter is the design token - never a hardcoded literal in the
 * component (design-system.md hard gate). */
const FALLBACK_GUTTER_PX = 0;

/** Reads a CSS length custom property (e.g. `--space-2`) off the document
 * root and resolves it to pixels, so floating-element math stays token
 * driven instead of hardcoding a literal spacing value. */
function tokenPx(propertyName: string): number {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return FALLBACK_GUTTER_PX;
  }
  const root = document.documentElement;
  const raw = getComputedStyle(root).getPropertyValue(propertyName).trim();
  if (raw === "") {
    return FALLBACK_GUTTER_PX;
  }
  if (raw.endsWith("rem")) {
    const rem = parseFloat(raw);
    const rootFontSize = parseFloat(getComputedStyle(root).fontSize);
    if (Number.isNaN(rem) || Number.isNaN(rootFontSize)) {
      return FALLBACK_GUTTER_PX;
    }
    return rem * rootFontSize;
  }
  const px = parseFloat(raw);
  return Number.isNaN(px) ? FALLBACK_GUTTER_PX : px;
}

/** The minimum gap (px) a floating element keeps from the viewport edge;
 * mirrors the `--space-2` token. */
export function viewportGutterPx(): number {
  return tokenPx("--space-2");
}

export interface FloatingSize {
  width: number;
  height: number;
}

export interface FloatingPoint {
  top: number;
  left: number;
}

/**
 * Clamps an ideal (top, left) so a floating element of `size` stays fully
 * inside the current viewport, never letting it run off any edge (the
 * "clipped by the window edge" bug, item 3). Shifting (not resizing) keeps
 * the element fully readable.
 */
export function clampToViewport(
  ideal: FloatingPoint,
  size: FloatingSize,
): FloatingPoint {
  const gutter = viewportGutterPx();
  const maxLeft = Math.max(gutter, window.innerWidth - size.width - gutter);
  const maxTop = Math.max(gutter, window.innerHeight - size.height - gutter);
  return {
    left: Math.min(Math.max(ideal.left, gutter), maxLeft),
    top: Math.min(Math.max(ideal.top, gutter), maxTop),
  };
}
