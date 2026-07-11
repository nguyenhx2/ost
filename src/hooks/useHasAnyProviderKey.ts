import { useCallback, useEffect, useState } from "react";
import { keysIpc } from "../lib/ipc";
import { hasAnyProviderKey } from "../lib/providerKeys";

export interface UseHasAnyProviderKeyResult {
  /** Whether at least one provider has a masked "key present" status. */
  hasKey: boolean;
  /**
   * Initial status load in flight. `hasKey` stays optimistically `true` until
   * this resolves, so callers gating on it never flash the no-key notice
   * before the check has actually run.
   */
  loading: boolean;
  /** Re-check (e.g. after the user returns from Settings). */
  refresh: () => Promise<void>;
}

/**
 * Reactive "does any provider have a key configured" status for translation
 * surfaces (region preview, caption overlay). Reads ONLY the masked
 * `key_present` status via `keysIpc.statuses()` - never a key value
 * (security-privacy.md). Used to show a distinct, actionable notice instead of
 * firing a translation request that is guaranteed to fail.
 */
export function useHasAnyProviderKey(): UseHasAnyProviderKeyResult {
  const [hasKey, setHasKey] = useState(true);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const list = await keysIpc.statuses();
    setHasKey(hasAnyProviderKey(list));
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const list = await keysIpc.statuses();
        if (active) {
          setHasKey(hasAnyProviderKey(list));
        }
      } catch {
        // Best-effort gating only: if the status check itself fails, do not
        // block a translation attempt - the ordinary failure path still
        // applies if the provider call subsequently fails for real.
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

  return { hasKey, loading, refresh };
}
