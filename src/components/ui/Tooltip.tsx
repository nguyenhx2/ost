import {
  cloneElement,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
} from "react";
import { createPortal } from "react-dom";
import { clampToViewport, viewportGutterPx } from "../../lib/floatingPosition";

export interface TooltipProps {
  /** Tooltip text (i18n'd by the caller). */
  text: string;
  /** A single focusable element; raw `title=` attributes are banned. */
  children: ReactElement<{ "aria-describedby"?: string }>;
}

interface TooltipPosition {
  top: number;
  left: number;
}

/**
 * Tooltip primitive: visible on hover AND keyboard focus, linked to the
 * trigger via aria-describedby. Portaled to `document.body` and positioned
 * from the anchor's measured rect (owner complaint, item 3): the overlay
 * windows are small, so a tooltip rendered in-place near an edge used to be
 * clipped by the overlay panel's `overflow: hidden` scroll clip
 * (RegionPreviewView.css) with no way to read it. The portal escapes that
 * ancestor clip entirely, and the position flips above/below and shifts
 * horizontally so the tooltip always stays fully inside the viewport.
 */
export function Tooltip({ text, children }: TooltipProps) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState<TooltipPosition | null>(null);
  const anchorRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    if (!visible) {
      return;
    }
    const anchor = anchorRef.current;
    const tooltip = tooltipRef.current;
    if (!anchor || !tooltip) {
      return;
    }
    const place = () => {
      const anchorRect = anchor.getBoundingClientRect();
      const tooltipRect = tooltip.getBoundingClientRect();
      const gutter = viewportGutterPx();
      // Prefer above the anchor; flip below when there is not enough room.
      let top = anchorRect.top - tooltipRect.height - gutter;
      if (top < gutter) {
        top = anchorRect.bottom + gutter;
      }
      const left =
        anchorRect.left + anchorRect.width / 2 - tooltipRect.width / 2;
      setPosition(
        clampToViewport(
          { top, left },
          { width: tooltipRect.width, height: tooltipRect.height },
        ),
      );
    };
    place();
    // The overlay window itself can resize/move; keep the tooltip pinned to
    // its (possibly moved) anchor rather than stale coordinates.
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [visible]);

  const show = () => setVisible(true);
  const hide = () => {
    setVisible(false);
    setPosition(null);
  };

  return (
    <span
      ref={anchorRef}
      className="ost-tooltip-wrapper"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {cloneElement(children, { "aria-describedby": id })}
      {visible
        ? createPortal(
            <span
              ref={tooltipRef}
              role="tooltip"
              id={id}
              className="ost-tooltip"
              // Computed viewport coordinates from the measured anchor/tooltip
              // rects - not a design-token bypass (design-system.md), the same
              // exception already granted to ProgressBar's data-driven width.
              style={
                position
                  ? { top: `${position.top}px`, left: `${position.left}px` }
                  : { visibility: "hidden" as const }
              }
            >
              {text}
            </span>,
            document.body,
          )
        : null}
    </span>
  );
}
