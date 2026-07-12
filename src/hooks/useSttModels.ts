import { useCallback, useEffect, useRef, useState } from "react";
import {
  asSttModelDeleteCommandError,
  asSttModelSwitchCommandError,
  EVENT_STT_MODEL_DOWNLOAD_PROGRESS,
  listenIpc,
  sttIpc,
  type ConsentDisclosure,
  type SttModelDeleteErrorKind,
  type SttModelDownloadProgressPayload,
  type SttModelInfo,
  type SttModelSwitchErrorKind,
} from "../lib/ipc";

/** A switch awaiting the user's consent-download decision (never auto-downloads). */
export interface PendingSttConsent {
  modelId: string;
  disclosure: ConsentDisclosure;
}

export interface SttDownloadProgress {
  downloadedBytes: number;
  totalBytes: number;
}

/**
 * Per-model download/switch state, KEYED BY MODEL ID rather than tied to
 * whichever model the dropdown currently shows (owner fix, TASK-034): picking
 * a different tier in the Select while model X is still downloading must not
 * hide X's progress - each entry lives in the `downloads` map until X's own
 * fetch settles (success, failure, or cancel), independent of any other
 * selection made in the meantime.
 */
export interface SttModelDownloadState {
  /** `true` while the user has requested (and not yet confirmed) cancelling. */
  cancelling: boolean;
  /** Live progress, or `null` before the first progress event arrives. */
  progress: SttDownloadProgress | null;
}

export interface UseSttModelsResult {
  /** Every catalog tier evaluated against the current hardware probe. */
  models: SttModelInfo[];
  loading: boolean;
  /** Set while the consent dialog should be open; null otherwise. */
  pendingConsent: PendingSttConsent | null;
  /** In-flight downloads, keyed by model id - see [`SttModelDownloadState`]. */
  downloads: Record<string, SttModelDownloadState>;
  /** Last switch/download failure, or null. */
  error: SttModelSwitchErrorKind | null;
  /** Last delete failure, or null. */
  deleteError: SttModelDeleteErrorKind | null;
  /** Pick a tier: applies immediately, or opens the consent dialog. */
  selectModel: (modelId: string) => void;
  /** User confirmed the pending consent dialog - downloads then switches. */
  confirmDownload: () => void;
  /** User declined the pending consent dialog; nothing is downloaded. */
  cancelConsent: () => void;
  /** Aborts `modelId`'s in-flight download cleanly (partial file removed). */
  cancelDownload: (modelId: string) => void;
  /** Deletes a downloaded model's file from disk (Settings model list). */
  deleteModel: (modelId: string) => Promise<void>;
  /** Reload the model list (e.g. after a switch). */
  refresh: () => Promise<void>;
}

function setDownload(
  setter: (
    fn: (
      prev: Record<string, SttModelDownloadState>,
    ) => Record<string, SttModelDownloadState>,
  ) => void,
  modelId: string,
  patch: Partial<SttModelDownloadState>,
) {
  setter((prev) => {
    const existing: SttModelDownloadState = prev[modelId] ?? {
      cancelling: false,
      progress: null,
    };
    return {
      ...prev,
      [modelId]: { ...existing, ...patch },
    };
  });
}

function clearDownload(
  setter: (
    fn: (
      prev: Record<string, SttModelDownloadState>,
    ) => Record<string, SttModelDownloadState>,
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
 * Settings-time STT model switcher (FR-01, TASK-026 part C,
 * PRD-FR-01-stt-backend-options). Extends the BR-08 first-run consent-download
 * gate to "any time in Settings": picking an already-downloaded tier switches
 * immediately, an undownloaded tier requires an explicit consent grant naming
 * the exact download size (human-in-the-loop.md - never a silent download),
 * with progress reported over `stt:model-download-progress`. Rejects mid-
 * session switches with a typed `sessionActive` error the caller renders
 * clearly. TASK-034 adds: per-model-id download state (persists across a
 * dropdown change), an explicit cancel, and per-model delete/re-download.
 */
export function useSttModels(): UseSttModelsResult {
  const [models, setModels] = useState<SttModelInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingConsent, setPendingConsent] =
    useState<PendingSttConsent | null>(null);
  const [downloads, setDownloads] = useState<
    Record<string, SttModelDownloadState>
  >({});
  const [error, setError] = useState<SttModelSwitchErrorKind | null>(null);
  const [deleteError, setDeleteError] =
    useState<SttModelDeleteErrorKind | null>(null);
  const downloadsRef = useRef(downloads);
  downloadsRef.current = downloads;

  const refresh = useCallback(async () => {
    try {
      const next = await sttIpc.listModels();
      setModels(next);
    } catch {
      // Keep the previous list rather than throwing; the section stays
      // usable and a retry (re-render/refresh) can succeed later.
    }
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const next = await sttIpc.listModels();
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
      const un = await listenIpc<SttModelDownloadProgressPayload>(
        EVENT_STT_MODEL_DOWNLOAD_PROGRESS,
        (payload) => {
          // Only tracked while the model's own entry is live (registered by
          // confirmDownload below) - a stray/late event for an id nobody is
          // watching is ignored rather than resurrecting a stale entry.
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

  const selectModel = useCallback(
    (modelId: string) => {
      setError(null);
      void (async () => {
        try {
          const outcome = await sttIpc.requestSwitch(modelId);
          if (outcome.status === "consentRequired") {
            // Never downloads on its own - only opens the dialog.
            setPendingConsent({ modelId, disclosure: outcome.disclosure });
            return;
          }
          await refresh();
        } catch (err) {
          setError(asSttModelSwitchCommandError(err).kind);
        }
      })();
    },
    [refresh],
  );

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
    // Registers a live entry BEFORE the request starts, so progress events for
    // this id are accepted immediately and the entry survives any LATER
    // dropdown change (it is keyed by id, not by "the current selection").
    setDownload(setDownloads, modelId, { cancelling: false, progress: null });
    void (async () => {
      try {
        await sttIpc.confirmSwitch(modelId);
        await refresh();
      } catch (err) {
        const kind = asSttModelSwitchCommandError(err).kind;
        // A user-requested cancel is not an error banner - just reset.
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
    void sttIpc.cancelDownload(modelId);
  }, []);

  const deleteModel = useCallback(
    async (modelId: string) => {
      setDeleteError(null);
      try {
        await sttIpc.deleteModel(modelId);
        await refresh();
      } catch (err) {
        setDeleteError(asSttModelDeleteCommandError(err).kind);
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
    deleteError,
    selectModel,
    confirmDownload,
    cancelConsent,
    cancelDownload,
    deleteModel,
    refresh,
  };
}
