import { cloneElement, useId, type ReactElement } from "react";

export interface TooltipProps {
  /** Tooltip text (i18n'd by the caller). */
  text: string;
  /** A single focusable element; raw `title=` attributes are banned. */
  children: ReactElement<{ "aria-describedby"?: string }>;
}

/**
 * CSS-driven tooltip primitive: visible on hover AND keyboard focus
 * (focus-within), linked to the trigger via aria-describedby.
 */
export function Tooltip({ text, children }: TooltipProps) {
  const id = useId();
  return (
    <span className="ost-tooltip-wrapper">
      {cloneElement(children, { "aria-describedby": id })}
      <span role="tooltip" id={id} className="ost-tooltip">
        {text}
      </span>
    </span>
  );
}
