/*
 * Source-language catalog for the region flow (BR-07: auto-detect PLUS manual
 * pin). The default is Auto; a manual pin sends a lowercased ISO 639-1 code as
 * `sourceLanguage` on `confirm_region_selection`, which drives fidelity and
 * rec-model routing core-side (ipc.md `SourceLanguage`). Vietnamese is listed
 * first among the pinnable codes because its OCR fidelity is degraded and the
 * pin is what makes the Degraded notice deterministic (S1 fix).
 */

import { SOURCE_LANGUAGE_AUTO, type SourceLanguage } from "./ipc";
import type { I18nKey } from "./i18n";

export interface SourceLanguageOption {
  value: SourceLanguage;
  /** i18n key for the human label (no hardcoded user-facing strings). */
  labelKey: I18nKey;
  /** ISO 3166-1 alpha-2 country code for the secondary flag visual (design-
   * system.md flag-SVG exception) - absent for Auto-detect, which has no
   * defensible single country. */
  flag?: string;
}

export const SOURCE_LANGUAGE_OPTIONS: SourceLanguageOption[] = [
  { value: SOURCE_LANGUAGE_AUTO, labelKey: "lang.auto" },
  { value: "vi", labelKey: "lang.vi", flag: "VN" },
  { value: "en", labelKey: "lang.en", flag: "GB" },
  { value: "ja", labelKey: "lang.ja", flag: "JP" },
  { value: "ko", labelKey: "lang.ko", flag: "KR" },
  { value: "zh", labelKey: "lang.zh", flag: "CN" },
  { value: "es", labelKey: "lang.es", flag: "ES" },
  { value: "fr", labelKey: "lang.fr", flag: "FR" },
  { value: "de", labelKey: "lang.de", flag: "DE" },
  { value: "ru", labelKey: "lang.ru", flag: "RU" },
  { value: "pt", labelKey: "lang.pt", flag: "PT" },
  { value: "it", labelKey: "lang.it", flag: "IT" },
  { value: "th", labelKey: "lang.th", flag: "TH" },
  { value: "id", labelKey: "lang.id", flag: "ID" },
  { value: "ar", labelKey: "lang.ar", flag: "SA" },
  { value: "hi", labelKey: "lang.hi", flag: "IN" },
];

export const DEFAULT_SOURCE_LANGUAGE: SourceLanguage = SOURCE_LANGUAGE_AUTO;

/**
 * Target-language catalog for the live audio session (AC-01.5). Unlike the
 * source list there is no `auto` option - a translation must have a concrete
 * target. Vietnamese is the product default (BR-07) and is listed first.
 */
export interface TargetLanguageOption {
  value: string;
  labelKey: I18nKey;
  /** ISO 3166-1 alpha-2 country code for the secondary flag visual. */
  flag?: string;
}

export const TARGET_LANGUAGE_OPTIONS: TargetLanguageOption[] = [
  { value: "vi", labelKey: "lang.vi", flag: "VN" },
  { value: "en", labelKey: "lang.en", flag: "GB" },
  { value: "ja", labelKey: "lang.ja", flag: "JP" },
  { value: "ko", labelKey: "lang.ko", flag: "KR" },
  { value: "zh", labelKey: "lang.zh", flag: "CN" },
  { value: "es", labelKey: "lang.es", flag: "ES" },
  { value: "fr", labelKey: "lang.fr", flag: "FR" },
  { value: "de", labelKey: "lang.de", flag: "DE" },
  { value: "ru", labelKey: "lang.ru", flag: "RU" },
  { value: "pt", labelKey: "lang.pt", flag: "PT" },
  { value: "it", labelKey: "lang.it", flag: "IT" },
  { value: "th", labelKey: "lang.th", flag: "TH" },
  { value: "id", labelKey: "lang.id", flag: "ID" },
  { value: "ar", labelKey: "lang.ar", flag: "SA" },
  { value: "hi", labelKey: "lang.hi", flag: "IN" },
];

/** Default target language (AC-01.5): Vietnamese, the product's primary locale. */
export const DEFAULT_TARGET_LANGUAGE = "vi";

/** Known language codes with a translated display label. */
const LANGUAGE_LABEL_KEYS: Record<string, I18nKey> = {
  auto: "lang.auto",
  vi: "lang.vi",
  en: "lang.en",
  ja: "lang.ja",
  ko: "lang.ko",
  zh: "lang.zh",
  es: "lang.es",
  fr: "lang.fr",
  de: "lang.de",
  ru: "lang.ru",
  pt: "lang.pt",
  it: "lang.it",
  th: "lang.th",
  id: "lang.id",
  ar: "lang.ar",
  hi: "lang.hi",
};

/**
 * The i18n key for a language code, or null for an unknown code. A detected
 * source language (AC-01.3) can be any ISO code whisper returns; unknown codes
 * are untrusted DATA the caller renders verbatim via PlainText.
 */
export function languageLabelKey(code: string): I18nKey | null {
  return LANGUAGE_LABEL_KEYS[code.toLowerCase()] ?? null;
}
