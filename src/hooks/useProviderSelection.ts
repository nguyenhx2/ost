import { useCallback, useEffect, useState } from "react";
import { type ProviderId } from "../lib/providers";
import {
  DEFAULT_PROVIDER_SETTINGS,
  loadProviderSettings,
  saveProviderSettings,
  type ProviderSettings,
} from "../lib/settings";

export type MoveDirection = "up" | "down";

export interface UseProviderSelectionResult {
  settings: ProviderSettings;
  loading: boolean;
  /** Switch the active provider (AC-03.5). */
  setDefaultProvider: (provider: ProviderId) => Promise<void>;
  /** Choose the model for a provider (AC-03.1 / AC-03.5). */
  setProviderModel: (provider: ProviderId, model: string) => Promise<void>;
  /** Reorder the fallback list (AC-03.6). */
  moveFallback: (index: number, direction: MoveDirection) => Promise<void>;
}

/**
 * Default provider/model + fallback order state (FR-03, AC-03.5/AC-03.6),
 * persisted through the settings lib (names only, never keys). Every mutation
 * updates local state and persists asynchronously.
 */
export function useProviderSelection(): UseProviderSelectionResult {
  const [settings, setSettings] = useState<ProviderSettings>(
    DEFAULT_PROVIDER_SETTINGS,
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const loaded = await loadProviderSettings();
        if (active) {
          setSettings(loaded);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const persist = useCallback(async (next: ProviderSettings) => {
    setSettings(next);
    await saveProviderSettings(next);
  }, []);

  const setDefaultProvider = useCallback(
    async (provider: ProviderId) => {
      await persist({ ...settings, defaultProvider: provider });
    },
    [persist, settings],
  );

  const setProviderModel = useCallback(
    async (provider: ProviderId, model: string) => {
      await persist({
        ...settings,
        models: { ...settings.models, [provider]: model },
      });
    },
    [persist, settings],
  );

  const moveFallback = useCallback(
    async (index: number, direction: MoveDirection) => {
      const order = settings.fallbackOrder;
      const target = direction === "up" ? index - 1 : index + 1;
      if (
        index < 0 ||
        index >= order.length ||
        target < 0 ||
        target >= order.length
      ) {
        return; // out-of-range no-op
      }
      const next = [...order];
      [next[index], next[target]] = [next[target], next[index]];
      await persist({ ...settings, fallbackOrder: next });
    },
    [persist, settings],
  );

  return {
    settings,
    loading,
    setDefaultProvider,
    setProviderModel,
    moveFallback,
  };
}
