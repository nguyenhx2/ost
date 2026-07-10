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
}

export const SOURCE_LANGUAGE_OPTIONS: SourceLanguageOption[] = [
  { value: SOURCE_LANGUAGE_AUTO, labelKey: "lang.auto" },
  { value: "vi", labelKey: "lang.vi" },
  { value: "en", labelKey: "lang.en" },
  { value: "ja", labelKey: "lang.ja" },
  { value: "ko", labelKey: "lang.ko" },
  { value: "zh", labelKey: "lang.zh" },
];

export const DEFAULT_SOURCE_LANGUAGE: SourceLanguage = SOURCE_LANGUAGE_AUTO;
