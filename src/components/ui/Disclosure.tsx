import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

export interface DisclosureProps {
  /** Trigger label - the disclosure's accessible name (i18n'd by the caller). */
  summary: ReactNode;
  /** Optional secondary text next to the summary (e.g. a short status hint). */
  meta?: ReactNode;
  children: ReactNode;
  /** Uncontrolled initial state (default closed - progressive disclosure). */
  defaultOpen?: boolean;
  /** Controlled open state; when provided, the caller owns toggling via `onOpenChange`. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
}

/**
 * Progressive-disclosure primitive (design-system.md): a single toggle button
 * (`aria-expanded`/`aria-controls`) that reveals secondary/advanced content -
 * used to keep rarely-touched controls out of the way without removing them
 * (owner ask, settings IA pass: "the 80% case visible, the rest collapsed").
 * Collapsed content stays in the DOM (`hidden` attribute, not unmounted) so
 * state inside it is not lost across a toggle.
 */
export function Disclosure({
  summary,
  meta,
  children,
  defaultOpen = false,
  open,
  onOpenChange,
  className,
}: DisclosureProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isControlled = open !== undefined;
  const isOpen = isControlled ? open : internalOpen;
  const contentId = useId();

  const toggle = () => {
    const next = !isOpen;
    if (!isControlled) {
      setInternalOpen(next);
    }
    onOpenChange?.(next);
  };

  return (
    <div className={`ost-disclosure${className ? ` ${className}` : ""}`}>
      <button
        type="button"
        className="ost-disclosure-trigger"
        aria-expanded={isOpen}
        aria-controls={contentId}
        onClick={toggle}
      >
        <ChevronDown
          size={16}
          aria-hidden="true"
          className="ost-disclosure-chevron"
        />
        <span className="ost-disclosure-summary">{summary}</span>
        {meta ? <span className="ost-disclosure-meta">{meta}</span> : null}
      </button>
      <div id={contentId} className="ost-disclosure-content" hidden={!isOpen}>
        {children}
      </div>
    </div>
  );
}
