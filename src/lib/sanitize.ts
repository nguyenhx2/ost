/*
 * Sanitizing plain-text pipeline for AI/pipeline-produced text (design-system.md,
 * human-in-the-loop.md): OCR output, transcripts and translations are untrusted
 * DATA. They are rendered exclusively as plain text (React text nodes - never
 * dangerouslySetInnerHTML, never markdown-interpreted); this module additionally
 * strips characters that could visually spoof the UI.
 */

// Control chars (except tab/newline/carriage-return), DEL, zero-width chars,
// bidi override/isolate controls and BOM - all of which can hide or reorder
// displayed text. Built from code points to keep this file free of invisible
// literal characters.
const DISALLOWED_RANGES: ReadonlyArray<[number, number]> = [
  [0x0000, 0x0008], // C0 controls before tab
  [0x000b, 0x000c], // vertical tab, form feed
  [0x000e, 0x001f], // C0 controls after carriage return
  [0x007f, 0x007f], // DEL
  [0x200b, 0x200f], // zero-width space/joiners, LRM/RLM
  [0x202a, 0x202e], // bidi embedding/override controls
  [0x2060, 0x2064], // word joiner + invisible operators
  [0x2066, 0x2069], // bidi isolate controls
  [0xfeff, 0xfeff], // BOM / zero-width no-break space
];

const DISALLOWED_CHARS = new RegExp(
  `[${DISALLOWED_RANGES.map(([from, to]) =>
    from === to
      ? `\\u{${from.toString(16)}}`
      : `\\u{${from.toString(16)}}-\\u{${to.toString(16)}}`,
  ).join("")}]`,
  "gu",
);

/** Strip control/invisible/bidi-override characters; keep \t, \n, \r. */
export function sanitizePlainText(text: string): string {
  return text.replace(DISALLOWED_CHARS, "");
}
