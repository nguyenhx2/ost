import { describe, expect, it } from "vitest";
import { sanitizePlainText } from "./sanitize";

// Build disallowed characters from code points so this test file itself
// contains no invisible literal characters.
const ch = (code: number) => String.fromCodePoint(code);
const RLO = ch(0x202e); // right-to-left override
const LRI = ch(0x2066); // left-to-right isolate
const PDI = ch(0x2069); // pop directional isolate
const ZWSP = ch(0x200b); // zero-width space
const LRM = ch(0x200e); // left-to-right mark
const BOM = ch(0xfeff);
const BEL = ch(0x0007);
const NUL = ch(0x0000);

describe("sanitizePlainText", () => {
  it("keeps ordinary text, Vietnamese diacritics, tabs and newlines", () => {
    const text = "Xin chào thế giới\nDòng hai\tcó tab";
    expect(sanitizePlainText(text)).toBe(text);
  });

  it("strips bidi override and isolate controls (display spoofing)", () => {
    expect(sanitizePlainText(`abc${RLO}def${LRI}ghi${PDI}`)).toBe("abcdefghi");
  });

  it("strips zero-width and BOM characters", () => {
    expect(sanitizePlainText(`a${ZWSP}b${LRM}c${BOM}d`)).toBe("abcd");
  });

  it("strips C0 control characters except tab/newline/CR", () => {
    expect(sanitizePlainText(`a${BEL}b${NUL}c\r\nd`)).toBe("abc\r\nd");
  });

  it("leaves markup-shaped text intact as inert characters", () => {
    const text = "<script>alert(1)</script> [link](https://evil.example)";
    expect(sanitizePlainText(text)).toBe(text);
  });
});
