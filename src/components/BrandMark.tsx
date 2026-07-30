import mark from "../assets/brand/mark.svg";
import "./BrandMark.css";

export interface BrandMarkProps {
  /** Extra class for size/placement at the call site (token-driven only). */
  className?: string;
}

/**
 * The OST app mark (design-system.md brand-SVG exception, self-hosted under
 * src/assets/brand/ - see the README there for the concept and provenance).
 * Purely decorative: always `alt=""` / `aria-hidden` - the accessible name
 * for "this is OST" is carried by the adjacent heading text it sits beside
 * (app.title / settings.title / history.title), never by the image alone.
 * Rendered as a sibling of that text, not a wrapper around it, so it never
 * duplicates the heading's accessible name.
 */
export function BrandMark({ className }: BrandMarkProps) {
  return (
    <img
      src={mark}
      alt=""
      aria-hidden="true"
      draggable={false}
      className={`brand-mark${className ? ` ${className}` : ""}`}
    />
  );
}
