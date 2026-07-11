import { useCallback, useEffect, useState } from "react";
import {
  asSttModelSwitchCommandError,
  EVENT_STT_MODEL_DOWNLOAD_PROGRESS,
  listenIpc,
  sttIpc,
  type ConsentDisclosure,
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
  modelId: string;
  downloadedBytes: number;
  totalBytes: number;
}

export type SttSwitchPhase = "idle" | "switching" | "downloading";

export interface UseSttModelsResult {
  /** Every catalog tier evaluated against the current hardware probe. */
  models: SttModelInfo[];
  loading: boolean;
  phase: SttSwitchPhase;
  /** Set while the consent dialog should be open; null otherwise. */
  pendingConsent: PendingSttConsent | null;
  /** Live download progress while `phase === "downloading"`. */
  progress: SttDownloadProgress | null;
  /** Last switch failure, or null. */
  error: SttModelSwitchErrorKind | null;
  /** Pick a tier: applies immediately, or opens the consent dialog. */
  selectModel: (modelId: string) => void;
  /** User confirmed the pending consent dialog - downloads then switches. */
  confirmDownload: () => void;
  /** User declined the pending consent dialog; nothing is downloaded. */
  cancelConsent: () => void;
  /** Reload the model list (e.g. after a switch). */
  refresh: () => Promise<void>;
}

/**
 * Settings-time STT model switcher (FR-01, TASK-026 part C,
 * PRD-FR-01-stt-backend-options). Extends the BR-08 first-run consent-download
 * gate to "any time in Settings": picking an already-downloaded tier switches
 * immediately, an undownloaded tier requires an explicit consent grant naming
 * the exact download size (human-in-the-loop.md - never a silent download),
 * with progress reported over `stt:model-download-progress`. Rejects mid-
 * session switches with a typed `sessionActive` error the caller renders
 * clearly.
 */
export function useSttModels(): UseSttModelsResult {
  const [models, setModels] = useState<SttModelInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState<SttSwitchPhase>("idle");
  const [pendingConsent, setPendingConsent] =
    useState<PendingSttConsent | null>(null);
  const [progress, setProgress] = useState<SttDownloadProgress | null>(null);
  const [error, setError] = useState<SttModelSwitchErrorKind | null>(null);

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
          setProgress({
            modelId: payload.modelId,
            downloadedBytes: payload.downloadedBytes,
            totalBytes: payload.totalBytes,
          });
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
      setPhase("switching");
      void (async () => {
        try {
          const outcome = await sttIpc.requestSwitch(modelId);
          if (outcome.status === "consentRequired") {
            // Never downloads on its own - only opens the dialog.
            setPendingConsent({ modelId, disclosure: outcome.disclosure });
            setPhase("idle");
            return;
          }
          await refresh();
          setPhase("idle");
        } catch (err) {
          setError(asSttModelSwitchCommandError(err).kind);
          setPhase("idle");
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
    setPhase("downloading");
    setProgress(null);
    void (async () => {
      try {
        await sttIpc.confirmSwitch(modelId);
        setPendingConsent(null);
        await refresh();
      } catch (err) {
        setError(asSttModelSwitchCommandError(err).kind);
      } finally {
        setPhase("idle");
        setProgress(null);
      }
    })();
  }, [pendingConsent, refresh]);

  return {
    models,
    loading,
    phase,
    pendingConsent,
    progress,
    error,
    selectModel,
    confirmDownload,
    cancelConsent,
    refresh,
  };
}
