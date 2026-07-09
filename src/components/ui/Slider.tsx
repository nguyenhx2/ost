import { useId } from "react";

export interface SliderProps {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  /** Accessible name (i18n'd by the caller). */
  label: string;
}

/**
 * Range slider primitive. Uses the native range input (fully keyboard
 * accessible: arrows/Home/End) styled through tokens; only native <select>
 * and raw tables are banned by design-system.md.
 */
export function Slider({
  value,
  min,
  max,
  step,
  onChange,
  label,
}: SliderProps) {
  const id = useId();
  return (
    <span className="ost-slider-field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="range"
        className="ost-slider"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </span>
  );
}
