import type { ButtonHTMLAttributes, ReactNode } from "react";

export interface IconButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "className" | "style" | "aria-label" | "children"
> {
  /** Accessible name - REQUIRED on icon-only buttons (frontend.md, WCAG). */
  label: string;
  /** A lucide-react SVG icon element (no emoji, design-system.md). */
  children: ReactNode;
  /** For toggle buttons (e.g. pin): exposes aria-pressed. */
  pressed?: boolean;
}

/** Icon-only button primitive with a mandatory aria-label. */
export function IconButton({
  label,
  children,
  pressed,
  ...rest
}: IconButtonProps) {
  return (
    <button
      type="button"
      className="ost-icon-button"
      aria-label={label}
      aria-pressed={pressed}
      {...rest}
    >
      {children}
    </button>
  );
}
