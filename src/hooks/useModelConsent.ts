import { useCallback, useEffect, useState } from "react";
import {
  modelIpc,
  OCR_MODEL_SET_ID,
  type ModelConsentStatus,
} from "../lib/ipc";

/**
 * Model sets whose download consent can be reviewed and revoked in Settings
 * (BR-08 model-download consent). OCR is the only downloadable set today;
 * whisper STT lands in Phase 2 and appends its id here.
 */
export const CONSENTABLE_MODEL_SET_IDS = [OCR_MODEL_SET_ID] as const;

/** Transient per-set state for the revoke action (drives inline status copy). */
export type RevokeState = "idle" | "busy" | "error";

export interface UseModelConsentResult {
  /** Consent flag + disclosure for every consentable model set. */
  statuses: ModelConsentStatus[];
  /** Initial status load in flight. */
  loading: boolean;
  /** Last revoke outcome per model set id. */
  revokeState: Record<string, RevokeState>;
  /**
   * Revoke a previously granted consent. The fail-closed download gate lives
   * in Rust; this only flips the persisted flag so the NEXT download re-prompts
   * (security-privacy.md). Never throws - failures land in `revokeState`.
   */
  revoke: (modelSetId: string) => Promise<void>;
  /** Reload consent statuses. */
  refresh: () => Promise<void>;
}

/**
 * Model-download consent state for the Settings UI (FR-02/FR-04, TASK-012).
 * All IPC goes through the typed `modelIpc` wrapper; the surface carries only a
 * model set id and the masked disclosure - never a key or captured content.
 */
export function useModelConsent(): UseModelConsentResult {
  const [statuses, setStatuses] = useState<ModelConsentStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [revokeState, setRevokeState] = useState<Record<string, RevokeState>>(
    {},
  );

  const refresh = useCallback(async () => {
    const next = await Promise.all(
      CONSENTABLE_MODEL_SET_IDS.map((id) => modelIpc.consentStatus(id)),
    );
    setStatuses(next);
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const next = await Promise.all(
          CONSENTABLE_MODEL_SET_IDS.map((id) => modelIpc.consentStatus(id)),
        );
        if (active) {
          setStatuses(next);
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

  const revoke = useCallback(
    async (modelSetId: string): Promise<void> => {
      setRevokeState((prev) => ({ ...prev, [modelSetId]: "busy" }));
      try {
        await modelIpc.revokeConsent(modelSetId);
        await refresh();
        setRevokeState((prev) => ({ ...prev, [modelSetId]: "idle" }));
      } catch {
        // Fail-closed is unchanged; surface an actionable error, never throw.
        setRevokeState((prev) => ({ ...prev, [modelSetId]: "error" }));
      }
    },
    [refresh],
  );

  return { statuses, loading, revokeState, revoke, refresh };
}
