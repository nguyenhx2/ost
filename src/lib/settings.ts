import { load, type Store } from "@tauri-apps/plugin-store";
import {
  isProviderId,
  PROVIDER_IDS,
  PROVIDER_META,
  type ProviderId,
} from "./providers";

/**
 * Settings persistence (FR-03 default provider + per-provider model + fallback
 * order, AC-03.1, AC-03.5, AC-03.6). Backed by tauri-plugin-store (JSON on
 * disk).
 *
 * SECURITY (BR-02, security-privacy.md): this store holds NAMES ONLY - provider
 * ids, opaque model ids, and a fallback order. API keys NEVER touch it; they
 * live solely in the OS keychain via `src-tauri/src/keys/`.
 */

const STORE_FILE = "settings.json";
const SELECTION_KEY = "providerSelection";

export interface ProviderSettings {
  /** Active provider used for translation (AC-03.5). */
  defaultProvider: ProviderId;
  /** Chosen model per provider (opaque model id) - AC-03.1 "choose model". */
  models: Record<ProviderId, string>;
  /** Provider try-order on failure (AC-03.6); always the full set, deduped. */
  fallbackOrder: ProviderId[];
}

function firstModel(provider: ProviderId): string {
  return PROVIDER_META[provider].models[0]?.id ?? "";
}

function defaultModels(): Record<ProviderId, string> {
  return PROVIDER_IDS.reduce(
    (acc, id) => {
      acc[id] = firstModel(id);
      return acc;
    },
    {} as Record<ProviderId, string>,
  );
}

export const DEFAULT_PROVIDER_SETTINGS: ProviderSettings = {
  defaultProvider: "gemini",
  models: defaultModels(),
  fallbackOrder: [...PROVIDER_IDS],
};

let storePromise: Promise<Store> | null = null;

function getStore(): Promise<Store> {
  if (storePromise === null) {
    // load() takes no options here; persistence is controlled explicitly via
    // save() after every set() (see saveProviderSettings).
    storePromise = load(STORE_FILE);
  }
  return storePromise;
}

/**
 * Complete a (possibly partial or dirty) fallback order into the full provider
 * set: keep the given valid ids in order, dedupe, then append any missing
 * providers in canonical order. Guarantees every provider appears exactly once.
 */
export function normalizeFallbackOrder(order: readonly string[]): ProviderId[] {
  const seen = new Set<ProviderId>();
  const result: ProviderId[] = [];
  for (const id of order) {
    if (isProviderId(id) && !seen.has(id)) {
      seen.add(id);
      result.push(id);
    }
  }
  for (const id of PROVIDER_IDS) {
    if (!seen.has(id)) {
      result.push(id);
    }
  }
  return result;
}

function coerceModels(raw: unknown): Record<ProviderId, string> {
  const models = defaultModels();
  if (typeof raw === "object" && raw !== null) {
    const record = raw as Record<string, unknown>;
    for (const id of PROVIDER_IDS) {
      const value = record[id];
      if (typeof value === "string" && value.length > 0) {
        models[id] = value;
      }
    }
  }
  return models;
}

function coerceSettings(raw: unknown): ProviderSettings {
  if (typeof raw !== "object" || raw === null) {
    return DEFAULT_PROVIDER_SETTINGS;
  }
  const record = raw as Record<string, unknown>;

  const defaultProvider =
    typeof record.defaultProvider === "string" &&
    isProviderId(record.defaultProvider)
      ? record.defaultProvider
      : DEFAULT_PROVIDER_SETTINGS.defaultProvider;

  const models = coerceModels(record.models);

  const rawOrder = Array.isArray(record.fallbackOrder)
    ? record.fallbackOrder.filter((v): v is string => typeof v === "string")
    : [];
  const fallbackOrder = normalizeFallbackOrder(rawOrder);

  return { defaultProvider, models, fallbackOrder };
}

/** The active model = the chosen model for the active provider (AC-03.5). */
export function activeModel(settings: ProviderSettings): string {
  return settings.models[settings.defaultProvider];
}

/** Load the persisted provider selection, or defaults when absent/corrupt. */
export async function loadProviderSettings(): Promise<ProviderSettings> {
  const store = await getStore();
  const raw = await store.get<unknown>(SELECTION_KEY);
  return coerceSettings(raw);
}

/** Persist the provider selection (names only). Normalizes before writing. */
export async function saveProviderSettings(
  settings: ProviderSettings,
): Promise<void> {
  const normalized: ProviderSettings = {
    defaultProvider: settings.defaultProvider,
    models: { ...settings.models },
    fallbackOrder: normalizeFallbackOrder(settings.fallbackOrder),
  };
  const store = await getStore();
  await store.set(SELECTION_KEY, normalized);
  await store.save();
}
