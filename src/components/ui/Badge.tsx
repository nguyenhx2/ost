import type { ReactNode } from "react";

export interface BadgeProps {
  variant?: "default" | "warning";
  children: ReactNode;
  /** Optional accessible name when the badge content alone is not descriptive. */
  label?: string;
}

/** Small status badge primitive (provider/model, low-confidence flag). */
export function Badge({ variant = "default", children, label }: BadgeProps) {
  const variantClass = variant === "warning" ? " ost-badge--warning" : "";
  return (
    <span className={`ost-badge${variantClass}`} aria-label={label}>
      {children}
    </span>
  );
}
