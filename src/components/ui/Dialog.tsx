import { useEffect, useRef, type ReactNode } from "react";

export interface DialogProps {
  /** When false, nothing is rendered (the dialog is fully unmounted). */
  open: boolean;
  /** Accessible name of the dialog surface (i18n'd by the caller). */
  label: string;
  /**
   * Requested-close callback (Esc key or backdrop click). The caller decides
   * what closing means; for a fail-closed consent gate this is the DECLINE
   * path - it never grants anything on its own.
   */
  onClose: () => void;
  children: ReactNode;
}

/**
 * Modal Dialog primitive (design-system.md). Token-driven scrim + surface,
 * role="dialog" + aria-modal, focus moves to the panel on open, Esc and a
 * backdrop click request close. Content (including any confirm/decline actions)
 * is supplied by the caller so this stays a pure, reusable surface.
 */
export function Dialog({ open, label, onClose, children }: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      panelRef.current?.focus();
    }
  }, [open]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="ost-dialog-backdrop"
      onClick={(e) => {
        // Backdrop-only: clicks inside the panel must not request close.
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className="ost-dialog"
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            onClose();
          }
        }}
      >
        {children}
      </div>
    </div>
  );
}
