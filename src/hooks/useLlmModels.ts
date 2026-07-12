import { useCallback, useEffect, useRef, useState } from "react";
import {
  asLlmModelCommandError,
  EVENT_LLM_MODEL_DOWNLOAD_PROGRESS,
  listenIpc,
  llmIpc,
  type ConsentDisclosure,
  type LlmModelErrorKind,
  type LlmModelDownloadProgressPayload,
  type LlmModelInfo,
} from "../lib/ipc";

/** A download awaiting the user's consent decision (never auto-downloads). */
export interface PendingLlmConsent {
  modelId: string;
  disclosure: ConsentDisclosure;
}

export interface LlmDownloadProgress {
  downloadedBytes: number;
  totalBytes: number;
}

/** Per-model download state, KEYED BY MODEL ID (mirrors `useSttModels.ts`
 * TASK-034 fix) so a download survives the user looking at a different row or
 * switching tabs, independent of any other selection made in the meantime. */
export interface LlmModelDownloadState {
  /** `true` while the user has requested (and not yet confirmed) cancelling. */
  cancelling: boolean;
  /** Live progress, or `null` before the first progress event arrives. */
  progress: LlmDownloadProgress | null;
}

export interface UseLlmModelsResult {
  /** Every shipped GGUF preset with its download/running state. */
  models: LlmModelInfo[];
  loading: boolean;
  /** Set while the consent dialog should be open; null otherwise. */
  pendingConsent: PendingLlmConsent | null;
  /** In-flight downloads, keyed by model id. */
  downloads: Record<string, LlmModelDownloadState>;
  /** Last download/delete failure, or null. */
  error: LlmModelErrorKind | null;
  /** Request a download: applies immediately if already on disk, otherwise
   * opens the consent dialog (human-in-the-loop.md - never a silent fetch). */
  requestDownload: (modelId: string) => void;
  /** User confirmed the pending consent dialog. */
  confirmDownload: () => void;
  /** User declined the pending consent dialog; nothing is downloaded. */
  cancelConsent: () => void;
  /** Aborts `modelId`'s in-flight download cleanly. */
  cancelDownload: (modelId: string) => void;
  /** Deletes a downloaded model's file from disk (re-download later). */
  deleteModel: (modelId: string) => Promise<void>;
  /** Reload the model list (e.g. after a server start/stop). */
  refresh: () => Promise<void>;
}

function setDownload(
  setter: (
    fn: (
      prev: Record<string, LlmModelDownloadState>,
    ) => Record<string, LlmModelDownloadState>,
  ) => void,
  modelId: string,
  patch: Partial<LlmModelDownloadState>,
) {
  setter((prev) => {
    const existing: LlmModelDownloadState = prev[modelId] ?? {
      cancelling: false,
      progress: null,
    };
    return { ...prev, [modelId]: { ...existing, ...patch } };
  });
}

function clearDownload(
  setter: (
    fn: (
      prev: Record<string, LlmModelDownloadState>,
    ) => Record<string, LlmModelDownloadState>,
  ) => void,
  modelId: string,
) {
  setter((prev) => {
    if (!(modelId in prev)) {
      return prev;
    }
    const next = { ...prev };
    delete next[modelId];
    return next;
  });
}

/**
 * Settings-time local-LLM GGUF model management (ADR-006): download/cancel/
 * delete a preset, with the same fail-closed consent-download gate and
 * per-model-id progress tracking as `useSttModels.ts`. Never starts or stops
 * the managed server itself - see `useLlmServer.ts`.
 */
export function useLlmModels(): UseLlmModelsResult {
  const [models, setModels] = useState<LlmModelInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingConsent, setPendingConsent] =
    useState<PendingLlmConsent | null>(null);
  const [downloads, setDownloads] = useState<
    Record<string, LlmModelDownloadState>
  >({});
  const [error, setError] = useState<LlmModelErrorKind | null>(null);
  const downloadsRef = useRef(downloads);
  downloadsRef.current = downloads;

  const refresh = useCallback(async () => {
    try {
      const next = await llmIpc.listModels();
      setModels(next);
    } catch {
      // Keep the previous list rather than throwing; a later refresh can
      // succeed.
    }
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const next = await llmIpc.listModels();
        if (active) {
          setModels(next);
        }
      } catch {
        // See refresh() above.
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
    let unlisten: (() => void) | null = null;
    let disposed = false;
    void (async () => {
      const un = await listenIpc<LlmModelDownloadProgressPayload>(
        EVENT_LLM_MODEL_DOWNLOAD_PROGRESS,
        (payload) => {
          if (!(payload.modelId in downloadsRef.current)) {
            return;
          }
          setDownloads((prev) => ({
            ...prev,
            [payload.modelId]: {
              cancelling: prev[payload.modelId]?.cancelling ?? false,
              progress: {
                downloadedBytes: payload.downloadedBytes,
                totalBytes: payload.totalBytes,
              },
            },
          }));
        },
      );
      if (disposed) {
        un();
        return;
      }
      unlisten = un;
    })();
    return () => {
      disposed = true;
      if (unlisten) {
        unlisten();
      }
    };
  }, []);

  const requestDownload = useCallback((modelId: string) => {
    setError(null);
    void (async () => {
      try {
        const outcome = await llmIpc.requestDownload(modelId);
        if (outcome.status === "consentRequired") {
          setPendingConsent({ modelId, disclosure: outcome.disclosure });
          return;
        }
        // alreadyDownloaded: nothing to do, the list already reflects it.
      } catch (err) {
        setError(asLlmModelCommandError(err).kind);
      }
    })();
  }, []);

  const cancelConsent = useCallback(() => {
    setPendingConsent(null);
  }, []);

  const confirmDownload = useCallback(() => {
    if (!pendingConsent) {
      return;
    }
    const { modelId } = pendingConsent;
    setError(null);
    setPendingConsent(null);
    setDownload(setDownloads, modelId, { cancelling: false, progress: null });
    void (async () => {
      try {
        await llmIpc.confirmDownload(modelId);
        await refresh();
      } catch (err) {
        const kind = asLlmModelCommandError(err).kind;
        if (kind !== "cancelled") {
          setError(kind);
        }
      } finally {
        clearDownload(setDownloads, modelId);
      }
    })();
  }, [pendingConsent, refresh]);

  const cancelDownload = useCallback((modelId: string) => {
    if (!(modelId in downloadsRef.current)) {
      return;
    }
    setDownload(setDownloads, modelId, { cancelling: true });
    void llmIpc.cancelDownload(modelId);
  }, []);

  const deleteModel = useCallback(
    async (modelId: string) => {
      setError(null);
      try {
        await llmIpc.deleteModel(modelId);
        await refresh();
      } catch (err) {
        setError(asLlmModelCommandError(err).kind);
      }
    },
    [refresh],
  );

  return {
    models,
    loading,
    pendingConsent,
    downloads,
    error,
    requestDownload,
    confirmDownload,
    cancelConsent,
    cancelDownload,
    deleteModel,
    refresh,
  };
}
