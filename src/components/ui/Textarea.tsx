import { useId, type ClipboardEvent, type TextareaHTMLAttributes } from "react";

export interface TextareaProps extends Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  "className" | "style" | "value" | "onChange" | "onPaste" | "aria-label"
> {
  /** Visible + accessible label (i18n'd by the caller). */
  label: string;
  value: string;
  onChange: (value: string) => void;
  /**
   * Pasted plain text (untrusted DATA - agent-guardrails.md section 2). When
   * provided, the default paste is intercepted (`preventDefault`) so only the
   * `text/plain` payload lands in the field - never richly-formatted HTML/RTF
   * clipboard content, which could otherwise carry markup the app must never
   * interpret.
   */
  onPasteText?: (text: string) => void;
}

/**
 * Multi-line text primitive (design-system.md): native `<textarea>` styled
 * from tokens only, the paste-target counterpart of `Input`. Used by the
 * region-preview source area so a user can paste or edit text to translate,
 * in addition to OCR-captured text.
 */
export function Textarea({
  label,
  value,
  onChange,
  onPasteText,
  id,
  ...rest
}: TextareaProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;

  const handlePaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    if (!onPasteText) {
      return;
    }
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    onPasteText(text);
  };

  return (
    <span className="ost-textarea-field">
      <label className="ost-textarea-label" htmlFor={fieldId}>
        {label}
      </label>
      <textarea
        {...rest}
        id={fieldId}
        className="ost-textarea"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onPaste={handlePaste}
      />
    </span>
  );
}
