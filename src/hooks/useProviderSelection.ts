import { useCallback, useEffect, useState } from "react";
import { type ProviderId } from "../lib/providers";
import {
  DEFAULT_PROVIDER_SETTINGS,
  loadProviderSettings,
  saveProviderSettings,
  type ProviderSettings,
} from "../lib/settings";

export type MoveDirection = "up" | "down";

/**
 * Machine-readable persistence outcome the view can map to an i18n message
 * (mirrors the typed error handling in useProviderKeys.ts). Only one failure
 * mode exists: the settings-store write rejected.
 */
export type SelectionError = { kind: "persist" };

export interface UseProviderSelectionResult {
  settings: ProviderSettings;
  loading: boolean;
  /** Last persistence failure, or null when the store is in sync. */
  error: SelectionError | null;
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
  const [error, setError] = useState<SelectionError | null>(null);

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
    // Optimistic update, then persist. A store-write rejection is caught and
    // surfaced as typed error state (never left as an unhandled rejection),
    // so the view can tell the user the change did not save.
    setSettings(next);
    try {
      await saveProviderSettings(next);
      setError(null);
    } catch {
      setError({ kind: "persist" });
    }
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
    error,
    setDefaultProvider,
    setProviderModel,
    moveFallback,
  };
}
