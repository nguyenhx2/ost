import type { ButtonHTMLAttributes, ReactNode } from "react";

export interface ButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "className"
> {
  variant?: "default" | "primary";
  children: ReactNode;
}

/** Text button primitive (design-system.md). */
export function Button({
  variant = "default",
  children,
  ...rest
}: ButtonProps) {
  const variantClass = variant === "primary" ? " ost-button--primary" : "";
  return (
    <button type="button" className={`ost-button${variantClass}`} {...rest}>
      {children}
    </button>
  );
}
