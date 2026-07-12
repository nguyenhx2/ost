import { Loader2 } from "lucide-react";

export interface SpinnerProps {
  /** Accessible name (i18n'd by the caller) - the icon itself is decorative. */
  label: string;
  size?: number;
}

/**
 * Indeterminate loading spinner (design-system.md primitive). Makes
 * "work is in flight" visually obvious - e.g. a streaming translation
 * (owner complaint: with no visible loading state, a slow-but-live
 * translation used to read as broken before text ever appeared). `role`
 * "status" + `aria-label` announce the state to assistive tech; the icon
 * itself is `aria-hidden`. Spins via the `--duration-spin` token;
 * `prefers-reduced-motion` zeroes the animation globally (base.css).
 */
export function Spinner({ label, size = 14 }: SpinnerProps) {
  return (
    <span className="ost-spinner" role="status" aria-label={label}>
      <Loader2 size={size} aria-hidden="true" className="ost-spinner-icon" />
    </span>
  );
}
