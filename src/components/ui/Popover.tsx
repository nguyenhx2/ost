import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { clampToViewport, viewportGutterPx } from "../../lib/floatingPosition";

export interface PopoverProps {
  /** Accessible name for the trigger button AND the panel region (i18n'd by
   * the caller). */
  label: string;
  /** Icon-only trigger content (a lucide-react SVG icon, design-system.md). */
  icon: ReactNode;
  /** Panel content - any mix of primitives (Select, Slider, Button, ...). */
  children: ReactNode;
}

interface PopoverPosition {
  top: number;
  left: number;
  minWidth: number;
}

function panelStyle(position: PopoverPosition | null): CSSProperties {
  if (!position) {
    return { visibility: "hidden" };
  }
  return {
    top: `${position.top}px`,
    left: `${position.left}px`,
    minWidth: `${position.minWidth}px`,
  };
}

/**
 * `true` when `target` is outside the popover's own trigger/panel. A nested
 * `Select`'s open listbox (and a `Tooltip`) are ALSO portaled to
 * `document.body` as their own sibling nodes - not a DOM descendant of this
 * panel - so a plain `contains()` check alone would treat "picking an
 * option in a Select that lives inside this popover" as an outside click and
 * close the popover mid-interaction. The class-name check below excludes
 * those known floating-primitive surfaces from the "outside" test.
 */
function isOutside(
  target: Node,
  trigger: HTMLElement | null,
  panel: HTMLElement | null,
): boolean {
  if (panel?.contains(target)) {
    return false;
  }
  if (trigger?.contains(target)) {
    return false;
  }
  if (
    target instanceof Element &&
    target.closest(".ost-select-listbox, .ost-tooltip")
  ) {
    return false;
  }
  return true;
}

/**
 * Popover primitive (design-system.md): a compact, keyboard-accessible
 * overflow surface for secondary controls. Lets a crowded surface (the
 * region/caption translation overlays) keep only its few high-frequency
 * controls always visible and move the rest (provider/model, language
 * pickers, opacity, layout, secondary copy) behind ONE disclosure affordance
 * instead of laying every control out flat - progressive disclosure, not a
 * feature cut (every control stays reachable and keyboard-operable).
 *
 * Portaled to `document.body` and positioned from the trigger's measured
 * rect (same pattern as `Select`/`Tooltip`) so it escapes the overlay
 * panel's `overflow: hidden` scroll clip and never gets cut off near a
 * window edge. Closes on Esc, an outside click, or re-clicking the trigger;
 * the Esc handler stops propagation so it never ALSO dismisses the overlay
 * window behind it (the overlay root itself closes on Esc unless pinned).
 */
export function Popover({ label, icon, children }: PopoverProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<PopoverPosition | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const id = useId();

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) {
      triggerRef.current?.focus();
    }
  };

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    const trigger = triggerRef.current;
    const panel = panelRef.current;
    if (!trigger || !panel) {
      return;
    }
    const place = () => {
      const triggerRect = trigger.getBoundingClientRect();
      const panelRect = panel.getBoundingClientRect();
      const gutter = viewportGutterPx();
      let top = triggerRect.bottom + gutter / 2;
      const overflowsBelow =
        top + panelRect.height > window.innerHeight - gutter;
      if (overflowsBelow) {
        const above = triggerRect.top - panelRect.height - gutter / 2;
        if (above >= gutter) {
          top = above;
        }
      }
      // Right-align to the trigger by default (the overflow trigger sits at
      // the overlay's top-right, next to pin/close) - still clamped fully
      // on-screen by clampToViewport below.
      const left = triggerRect.right - panelRect.width;
      const clamped = clampToViewport(
        { top, left },
        { width: panelRect.width, height: panelRect.height },
      );
      setPosition({
        ...clamped,
        minWidth: Math.min(panelRect.width, triggerRect.width),
      });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  // Outside click closes the popover - but never a click on a floating
  // primitive it owns indirectly (see isOutside above).
  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (e: MouseEvent) => {
      if (
        e.target instanceof Node &&
        isOutside(e.target, triggerRef.current, panelRef.current)
      ) {
        close(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  // Move focus into the panel on open (first focusable control, falling
  // back to the panel itself) so keyboard users land directly on the
  // disclosed controls instead of having to Tab past the trigger again.
  useEffect(() => {
    if (!open) {
      return;
    }
    const panel = panelRef.current;
    const focusable = panel?.querySelector<HTMLElement>(
      'button:not(:disabled), [href], input:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
    );
    (focusable ?? panel)?.focus();
  }, [open]);

  const onPanelKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      // Stops this Esc from ALSO bubbling to the overlay root's own Esc
      // dismiss handler - one press closes the popover only.
      e.stopPropagation();
      close(true);
    }
  };

  return (
    <span className="ost-popover">
      <button
        type="button"
        ref={triggerRef}
        className="ost-icon-button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label={label}
        onClick={() => (open ? close(true) : setOpen(true))}
      >
        {icon}
      </button>
      {open
        ? createPortal(
            <div
              ref={panelRef}
              id={id}
              role="group"
              aria-label={label}
              tabIndex={-1}
              className="ost-popover-panel"
              style={panelStyle(position)}
              onKeyDown={onPanelKeyDown}
            >
              {children}
            </div>,
            document.body,
          )
        : null}
    </span>
  );
}
