import { describe, expect, it } from "vitest";
import {
  SOURCE_LANGUAGE_OPTIONS,
  TARGET_LANGUAGE_OPTIONS,
  languageLabelKey,
} from "./languages";
import { setLocale, t } from "./i18n";

/** TASK-030: the major-language expansion. */
const EXPECTED_CODES = [
  "vi",
  "en",
  "ja",
  "ko",
  "zh",
  "es",
  "fr",
  "de",
  "ru",
  "pt",
  "it",
  "th",
  "id",
  "ar",
  "hi",
];

describe("language catalog (TASK-030 expansion)", () => {
  it("source list has Auto-detect first, then every expected code", () => {
    expect(SOURCE_LANGUAGE_OPTIONS[0].value).toBe("auto");
    const codes = SOURCE_LANGUAGE_OPTIONS.map((o) => o.value);
    for (const code of EXPECTED_CODES) {
      expect(codes).toContain(code);
    }
  });

  it("target list has no auto option and covers every expected code, vi first", () => {
    const codes = TARGET_LANGUAGE_OPTIONS.map((o) => o.value);
    expect(codes).not.toContain("auto");
    expect(TARGET_LANGUAGE_OPTIONS[0].value).toBe("vi");
    for (const code of EXPECTED_CODES) {
      expect(codes).toContain(code);
    }
  });

  it("every option resolves an i18n label in English and Vietnamese", () => {
    for (const option of [
      ...SOURCE_LANGUAGE_OPTIONS,
      ...TARGET_LANGUAGE_OPTIONS,
    ]) {
      setLocale("en");
      expect(t(option.labelKey)).not.toBe("");
      setLocale("vi");
      expect(t(option.labelKey)).not.toBe("");
    }
    setLocale("en");
  });

  it("languageLabelKey resolves every added code (used by the caption overlay)", () => {
    for (const code of EXPECTED_CODES) {
      expect(languageLabelKey(code)).not.toBeNull();
    }
    expect(languageLabelKey("xx")).toBeNull();
  });

  it("Vietnamese stays first among the pinnable source codes (Degraded-notice determinism)", () => {
    const pinnable = SOURCE_LANGUAGE_OPTIONS.filter((o) => o.value !== "auto");
    expect(pinnable[0].value).toBe("vi");
  });
});
