import { Flag } from "../components/ui/Flag";
import type { SelectOption } from "../components/ui/Select";
import { t } from "./i18n";
import type { SourceLanguageOption, TargetLanguageOption } from "./languages";

/**
 * Shared mapper from the language catalogs (src/lib/languages.ts) to the
 * `Select` primitive's option shape: i18n'd label plus an optional flag icon
 * (design-system.md flag-SVG exception - secondary visual only, the label
 * text stays the accessible name via `Select`'s per-option `aria-label`).
 * Used by every language picker (region select, region preview, live audio
 * settings/home) so the flag wiring lives in exactly one place.
 */
export function languageSelectOptions(
  options: readonly (SourceLanguageOption | TargetLanguageOption)[],
): SelectOption[] {
  return options.map((o) => ({
    value: o.value,
    label: t(o.labelKey),
    icon: o.flag ? <Flag country={o.flag} /> : undefined,
  }));
}
