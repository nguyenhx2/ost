export interface ProgressBarProps {
  /** Accessible name (i18n'd by the caller). */
  label: string;
  /** Percentage complete, 0-100. Out-of-range values are clamped. */
  value: number;
}

/**
 * Determinate progress bar primitive (design-system.md). Used for the STT
 * model-download progress (human-in-the-loop.md: never a silent multi-second/
 * multi-gigabyte download). Token-driven track/fill; the fill is data-driven
 * (not a design-token bypass) via a `scaleX` transform rather than an
 * animated `width` - `width` runs layout on every frame, `transform` stays on
 * the compositor (make-interfaces-feel-better performance guidance). The
 * reported `aria-valuenow`/min/max are unchanged - only the visual technique
 * moved.
 */
export function ProgressBar({ label, value }: ProgressBarProps) {
  const clamped = Math.max(
    0,
    Math.min(100, Number.isFinite(value) ? value : 0),
  );
  return (
    <div
      className="ost-progress"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped)}
    >
      <div
        className="ost-progress-fill"
        style={{ transform: `scaleX(${clamped / 100})` }}
      />
    </div>
  );
}
