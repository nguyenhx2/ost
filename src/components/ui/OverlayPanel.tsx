import type { CSSProperties, HTMLAttributes, ReactNode } from "react";

export interface OverlayPanelProps extends Omit<
  HTMLAttributes<HTMLElement>,
  "className" | "style"
> {
  /** Accessible name of the overlay surface. */
  label: string;
  /**
   * Background scrim opacity (0..1). Feeds the --overlay-scrim-opacity token
   * consumed by the panel background - a runtime token value, not a token
   * bypass (tokens.css documents it as user-adjustable).
   */
  scrimOpacity?: number;
  children: ReactNode;
}

/** The translation overlay surface primitive (design-system.md). */
export function OverlayPanel({
  label,
  scrimOpacity,
  children,
  ...rest
}: OverlayPanelProps) {
  const style =
    scrimOpacity === undefined
      ? undefined
      : ({ "--overlay-scrim-opacity": scrimOpacity } as CSSProperties);
  return (
    <section
      role="dialog"
      aria-label={label}
      className="ost-overlay-panel"
      style={style}
      {...rest}
    >
      {children}
    </section>
  );
}
