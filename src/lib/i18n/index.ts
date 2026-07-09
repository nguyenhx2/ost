import { translations, type I18nKey, type Locale } from "./translations";

export type { I18nKey, Locale };

/**
 * Minimal i18n module (AC-04.7): locale defaults to the OS display language
 * (Vietnamese when the OS is Vietnamese, otherwise English). A Settings
 * override lands with the Settings UI (out of scope for TASK-008).
 */

export function detectLocale(osLanguage?: string): Locale {
  const lang =
    osLanguage ?? (typeof navigator !== "undefined" ? navigator.language : "");
  return lang.toLowerCase().startsWith("vi") ? "vi" : "en";
}

let currentLocale: Locale = detectLocale();

export function getLocale(): Locale {
  return currentLocale;
}

export function setLocale(locale: Locale): void {
  currentLocale = locale;
}

/**
 * Translate a key in the current locale, with optional `{param}` interpolation.
 * Unknown params are left verbatim; missing keys fall back to English.
 */
export function t(
  key: I18nKey,
  params?: Record<string, string | number>,
): string {
  const template = translations[currentLocale][key] ?? translations.en[key];
  if (!params) {
    return template;
  }
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}
