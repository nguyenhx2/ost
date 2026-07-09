import { sanitizePlainText } from "../../lib/sanitize";

export interface PlainTextProps {
  /** Untrusted pipeline/provider text (OCR, transcript, translation). */
  text: string;
}

/**
 * Sanitizing plain-text renderer for AI/pipeline output (design-system.md,
 * human-in-the-loop.md). The text is rendered as a React text node - never
 * dangerouslySetInnerHTML, never interpreted as HTML/markdown - after
 * stripping control/invisible/bidi-override characters. Instruction-shaped
 * content in the text has no effect: it is displayed verbatim.
 */
export function PlainText({ text }: PlainTextProps) {
  return <span className="ost-plain-text">{sanitizePlainText(text)}</span>;
}
