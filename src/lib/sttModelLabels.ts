/*
 * Shared STT catalog-id -> i18n label-key mapping (FR-01, TASK-026 part C).
 * Used by BOTH the Settings STT engine picker and the home-screen status
 * summary (TASK-028) so the two surfaces never drift on tier display names.
 * The core's `SttModelInfo.label` (English fallback) is used only for an
 * unknown/future catalog id not covered here.
 */

import type { I18nKey } from "./i18n";

export const STT_MODEL_LABEL_KEYS: Partial<Record<string, I18nKey>> = {
  tiny: "settings.sttModelTiny",
  base: "settings.sttModelBase",
  small: "settings.sttModelSmall",
  "large-v3-turbo": "settings.sttModelLargeTurbo",
  "large-v3": "settings.sttModelLargeV3",
};
