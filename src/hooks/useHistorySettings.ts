import { useCallback, useEffect, useState } from "react";
import {
  HISTORY_ENABLED_DEFAULT,
  isHistoryEnabled,
  setHistoryEnabled,
} from "../lib/history";

export interface UseHistorySettingsResult {
  /** Whether recording is on (BR-06: ON by default). */
  enabled: boolean;
  loading: boolean;
  /** True when the last persist attempt failed (the toggle did not save). */
  error: boolean;
  /** Toggle recording (AC-04.6); persisted through the history lib. */
  setEnabled: (enabled: boolean) => Promise<void>;
}

/**
 * Settings-side history toggle (AC-04.6): loads the persisted enable flag and
 * persists changes optimistically, reverting on a store-write failure so the
 * switch never lies about what was saved.
 */
export function useHistorySettings(): UseHistorySettingsResult {
  const [enabled, setEnabledState] = useState(HISTORY_ENABLED_DEFAULT);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const value = await isHistoryEnabled();
        if (active) {
          setEnabledState(value);
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

  const setEnabled = useCallback(
    async (next: boolean) => {
      const previous = enabled;
      setEnabledState(next);
      try {
        await setHistoryEnabled(next);
        setError(false);
      } catch {
        setEnabledState(previous);
        setError(true);
      }
    },
    [enabled],
  );

  return { enabled, loading, error, setEnabled };
}
