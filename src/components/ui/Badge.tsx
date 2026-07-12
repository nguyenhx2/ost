import type { ReactNode } from "react";

export interface BadgeProps {
  variant?: "default" | "warning" | "success";
  children: ReactNode;
  /** Optional accessible name when the badge content alone is not descriptive. */
  label?: string;
}

/**
 * Small status badge primitive (provider/model, low-confidence flag).
 * `success` is the distinct "configured" state (a provider key present) -
 * a semantic color, never a hardcoded hex (design-system.md).
 */
export function Badge({ variant = "default", children, label }: BadgeProps) {
  const variantClass = variant !== "default" ? ` ost-badge--${variant}` : "";
  return (
    <span className={`ost-badge${variantClass}`} aria-label={label}>
      {children}
    </span>
  );
}
