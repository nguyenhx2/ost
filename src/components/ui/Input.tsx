import { useId, type InputHTMLAttributes } from "react";

export interface InputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "className" | "style" | "value" | "onChange" | "type" | "aria-label"
> {
  /** Visible + accessible label (i18n'd by the caller). */
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** `password` masks the value - the default for API key entry. */
  type?: "text" | "password";
  /** Marks the field invalid for assistive tech (pairs with describedById). */
  invalid?: boolean;
  /** id of the element describing the error (aria-describedby). */
  describedById?: string;
}

/**
 * Text/password Input primitive (design-system.md). Native `<input>` styled
 * from tokens only; there is no other text-entry element in the app. Secret
 * fields (`type="password"`) disable autocomplete so keys never land in the
 * browser credential UI.
 */
export function Input({
  label,
  value,
  onChange,
  type = "text",
  invalid,
  describedById,
  id,
  ...rest
}: InputProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  return (
    <span className="ost-input-field">
      <label className="ost-input-label" htmlFor={fieldId}>
        {label}
      </label>
      <input
        id={fieldId}
        className="ost-input"
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={invalid || undefined}
        aria-describedby={describedById}
        autoComplete={type === "password" ? "off" : undefined}
        spellCheck={type === "password" ? false : undefined}
        {...rest}
      />
    </span>
  );
}
