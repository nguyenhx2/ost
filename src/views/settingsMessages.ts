import type { KeyActionResult } from "../hooks/useProviderKeys";
import type { KeyErrorKind } from "../lib/ipc";
import type { I18nKey } from "../lib/i18n";

export interface ResultMessage {
  key: I18nKey;
  tone: "ok" | "danger";
}

function errorKey(kind: KeyErrorKind): I18nKey {
  // Every KeyErrorKind has a matching `settings.error.<kind>` i18n key.
  return `settings.error.${kind}` as I18nKey;
}

/**
 * Map a key action outcome to the i18n message + tone the Settings UI shows.
 * Returns null for non-message states (idle/busy). Pure - unit tested directly.
 */
export function resultMessage(result: KeyActionResult): ResultMessage | null {
  switch (result.type) {
    case "idle":
    case "busy":
      return null;
    case "saved":
      return { key: "settings.result.saved", tone: "ok" };
    case "storedUnvalidated":
      return { key: "settings.result.storedUnvalidated", tone: "ok" };
    case "valid":
      return { key: "settings.result.valid", tone: "ok" };
    case "invalid":
      return { key: "settings.result.invalid", tone: "danger" };
    case "error":
      return { key: errorKey(result.kind), tone: "danger" };
  }
}
