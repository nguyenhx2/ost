import { useCallback, useEffect, useState } from "react";
import {
  asKeyCommandError,
  keysIpc,
  type KeyErrorKind,
  type ProviderKeyStatus,
} from "../lib/ipc";
import { PROVIDER_IDS, type ProviderId } from "../lib/providers";

/**
 * Transient result of the last key action for one provider (drives the inline
 * status/error copy). All strings are i18n keys resolved in the view; the hook
 * only carries machine-readable outcomes.
 */
export type KeyActionResult =
  | { type: "idle" }
  | { type: "busy" }
  /** Key validated and stored (AC-03.4). */
  | { type: "saved" }
  /** Key stored without a live check (provider has no client yet). */
  | { type: "storedUnvalidated" }
  /** Key rejected by the provider - not stored (AC-03.4). */
  | { type: "invalid" }
  /** User-triggered check succeeded (AC-03.4). */
  | { type: "valid" }
  /** Transport/quota/keychain failure. */
  | { type: "error"; kind: KeyErrorKind };

type StatusMap = Record<ProviderId, boolean>;
type ResultMap = Record<ProviderId, KeyActionResult>;

function emptyStatusMap(): StatusMap {
  return PROVIDER_IDS.reduce((acc, id) => {
    acc[id] = false;
    return acc;
  }, {} as StatusMap);
}

function idleResultMap(): ResultMap {
  return PROVIDER_IDS.reduce((acc, id) => {
    acc[id] = { type: "idle" };
    return acc;
  }, {} as ResultMap);
}

function toStatusMap(list: ProviderKeyStatus[]): StatusMap {
  const map = emptyStatusMap();
  for (const status of list) {
    map[status.provider_id] = status.key_present;
  }
  return map;
}

export interface UseProviderKeysResult {
  /** Masked "key present" per provider (AC-03.3). */
  statuses: StatusMap;
  /** Last action outcome per provider. */
  results: ResultMap;
  /** Initial status load in flight. */
  loading: boolean;
  /**
   * Validate + store a key. Resolves to `true` when the caller should CLEAR the
   * input (key accepted/stored), `false` when it must stay (rejected/error) so
   * the user can correct it (human-in-the-loop.md).
   */
  saveKey: (provider: ProviderId, key: string) => Promise<boolean>;
  /** Re-check the stored key (AC-03.4). */
  checkKey: (provider: ProviderId) => Promise<void>;
  /** Remove the stored key (AC-03.7). */
  removeKey: (provider: ProviderId) => Promise<void>;
  /** Reload masked statuses. */
  refresh: () => Promise<void>;
}

/**
 * Key management state for the Settings UI (FR-03). All IPC goes through the
 * typed `keysIpc` wrapper; the key value is passed DOWN to `saveKey` only and
 * is never returned or retained here.
 */
export function useProviderKeys(): UseProviderKeysResult {
  const [statuses, setStatuses] = useState<StatusMap>(emptyStatusMap);
  const [results, setResults] = useState<ResultMap>(idleResultMap);
  const [loading, setLoading] = useState(true);

  const setResult = useCallback(
    (provider: ProviderId, result: KeyActionResult) => {
      setResults((prev) => ({ ...prev, [provider]: result }));
    },
    [],
  );

  const refresh = useCallback(async () => {
    const list = await keysIpc.statuses();
    setStatuses(toStatusMap(list));
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const list = await keysIpc.statuses();
        if (active) {
          setStatuses(toStatusMap(list));
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

  const saveKey = useCallback(
    async (provider: ProviderId, key: string): Promise<boolean> => {
      setResult(provider, { type: "busy" });
      try {
        const outcome = await keysIpc.saveKey(provider, key);
        if (outcome.status === "valid") {
          setResult(provider, { type: "saved" });
          await refresh();
          return true;
        }
        if (outcome.status === "stored") {
          setResult(provider, { type: "storedUnvalidated" });
          await refresh();
          return true;
        }
        // status === "invalid": rejected, not stored - keep the input.
        setResult(provider, { type: "invalid" });
        return false;
      } catch (err) {
        setResult(provider, {
          type: "error",
          kind: asKeyCommandError(err).kind,
        });
        return false;
      }
    },
    [refresh, setResult],
  );

  const checkKey = useCallback(
    async (provider: ProviderId): Promise<void> => {
      setResult(provider, { type: "busy" });
      try {
        const validation = await keysIpc.checkKey(provider);
        setResult(
          provider,
          validation.status === "valid"
            ? { type: "valid" }
            : { type: "invalid" },
        );
      } catch (err) {
        setResult(provider, {
          type: "error",
          kind: asKeyCommandError(err).kind,
        });
      }
    },
    [setResult],
  );

  const removeKey = useCallback(
    async (provider: ProviderId): Promise<void> => {
      setResult(provider, { type: "busy" });
      try {
        await keysIpc.deleteKey(provider);
        setResult(provider, { type: "idle" });
        await refresh();
      } catch (err) {
        setResult(provider, {
          type: "error",
          kind: asKeyCommandError(err).kind,
        });
      }
    },
    [refresh, setResult],
  );

  return {
    statuses,
    results,
    loading,
    saveKey,
    checkKey,
    removeKey,
    refresh,
  };
}
