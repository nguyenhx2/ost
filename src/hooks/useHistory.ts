import { useCallback, useEffect, useState } from "react";
import { copyToClipboard } from "../lib/ipc";
import { clearHistory, loadHistory, type HistoryEntry } from "../lib/history";

export interface UseHistoryResult {
  entries: HistoryEntry[];
  loading: boolean;
  /** Reload from the store (after external changes). */
  refresh: () => Promise<void>;
  /** Wipe the whole local history store (AC-04.5). */
  clearAll: () => Promise<void>;
  /** Copy an entry's translated text to the clipboard (AC-04.3/AC-04.8). */
  copyEntry: (entry: HistoryEntry) => void;
  /** Id of the entry whose text was just copied (drives aria-live feedback). */
  copiedId: string | null;
}

const COPY_FEEDBACK_MS = 2000;

/**
 * History-view state (FR-04, SCR "Lịch sử"): loads the persisted entries,
 * exposes the always-visible clear-all (AC-04.5) and a per-entry copy control
 * (AC-04.3, copy-only per AC-04.8). All persistence goes through the text-only
 * history lib.
 */
export function useHistory(): UseHistoryResult {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const loaded = await loadHistory();
    setEntries(loaded);
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const loaded = await loadHistory();
        if (active) {
          setEntries(loaded);
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

  useEffect(() => {
    if (copiedId === null) {
      return;
    }
    const timer = setTimeout(() => setCopiedId(null), COPY_FEEDBACK_MS);
    return () => clearTimeout(timer);
  }, [copiedId]);

  const clearAll = useCallback(async () => {
    await clearHistory();
    setEntries([]);
  }, []);

  const copyEntry = useCallback((entry: HistoryEntry) => {
    void copyToClipboard(entry.translatedText);
    setCopiedId(entry.id);
  }, []);

  return { entries, loading, refresh, clearAll, copyEntry, copiedId };
}
