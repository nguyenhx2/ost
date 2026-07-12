import { load, type Store } from "@tauri-apps/plugin-store";
import { SOURCE_LANGUAGE_AUTO, type SourceLanguage } from "./ipc";
import { DEFAULT_SOURCE_LANGUAGE, DEFAULT_TARGET_LANGUAGE } from "./languages";

/**
 * Persisted region-translation language preferences (BR-07: source auto-detect
 * PLUS a manual pin, plus a chosen target language - item 3, the owner's
 * language-picker request). NAMES only (language codes, never a secret) -
 * backed by tauri-plugin-store, same file as the provider settings.
 *
 * This is the shared default read by BOTH the home screen and the region
 * flow: the home screen picker writes it; `useRegionSelection` reads the
 * source pin as its initial value, and `useRegionPreview` reads/writes the
 * target language used for translate requests and recorded history.
 */

const STORE_FILE = "settings.json";
const REGION_LANGUAGE_KEY = "regionLanguage";

export interface RegionLanguageSettings {
  /** BR-07 manual pin; `"auto"` means no pin (default). */
  sourceLanguage: SourceLanguage;
  /** Target language for region translation (default `vi`). */
  targetLanguage: string;
}

export const DEFAULT_REGION_LANGUAGE_SETTINGS: RegionLanguageSettings = {
  sourceLanguage: DEFAULT_SOURCE_LANGUAGE,
  targetLanguage: DEFAULT_TARGET_LANGUAGE,
};

let storePromise: Promise<Store> | null = null;

function getStore(): Promise<Store> {
  if (storePromise === null) {
    storePromise = load(STORE_FILE);
  }
  return storePromise;
}

function coerce(raw: unknown): RegionLanguageSettings {
  if (typeof raw !== "object" || raw === null) {
    return { ...DEFAULT_REGION_LANGUAGE_SETTINGS };
  }
  const record = raw as Record<string, unknown>;
  const sourceLanguage =
    typeof record.sourceLanguage === "string" && record.sourceLanguage !== ""
      ? record.sourceLanguage
      : SOURCE_LANGUAGE_AUTO;
  const targetLanguage =
    typeof record.targetLanguage === "string" && record.targetLanguage !== ""
      ? record.targetLanguage
      : DEFAULT_TARGET_LANGUAGE;
  return { sourceLanguage, targetLanguage };
}

/** Load the persisted region-language preferences, or defaults when absent. */
export async function loadRegionLanguageSettings(): Promise<RegionLanguageSettings> {
  const store = await getStore();
  const raw = await store.get<unknown>(REGION_LANGUAGE_KEY);
  return coerce(raw);
}

/** Persist the region-language preferences (names only). */
export async function saveRegionLanguageSettings(
  settings: RegionLanguageSettings,
): Promise<void> {
  const store = await getStore();
  await store.set(REGION_LANGUAGE_KEY, settings);
  await store.save();
}
