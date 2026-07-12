import { useCallback, useEffect, useState } from "react";
import {
  asLlmServerCommandError,
  llmIpc,
  type LlmServerErrorKind,
  type LlmServerStatusView,
} from "../lib/ipc";

const IDLE_STATUS: LlmServerStatusView = {
  running: false,
  modelId: null,
  baseUrl: null,
  port: null,
};

export interface UseLlmServerResult {
  status: LlmServerStatusView;
  loading: boolean;
  /** `true` while a start/stop request is in flight. */
  busy: boolean;
  /** Last start/stop failure, or null. */
  error: LlmServerErrorKind | null;
  /** Starts (or restarts, for a different model) the managed server. */
  start: (modelId: string) => Promise<void>;
  /** Stops the managed server (idempotent). */
  stop: () => Promise<void>;
  /** Reload the status (e.g. after a model list refresh). */
  refresh: () => Promise<void>;
}

/**
 * Managed local-LLM server control (ADR-006, `start_llm_server` /
 * `stop_llm_server` / `llm_server_status`). Wiring the resulting loopback
 * `baseUrl` into the `local_openai` provider's settings is the CALLER's
 * responsibility (`onStarted`) - this hook only owns the server lifecycle, not
 * translation settings.
 */
export function useLlmServer(
  onStarted?: (status: LlmServerStatusView) => void,
): UseLlmServerResult {
  const [status, setStatus] = useState<LlmServerStatusView>(IDLE_STATUS);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<LlmServerErrorKind | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await llmIpc.serverStatus();
      setStatus(next);
    } catch {
      // Keep the previous status rather than throwing; a later refresh (or a
      // start/stop attempt) can recover.
    }
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const next = await llmIpc.serverStatus();
        if (active) {
          setStatus(next);
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

  const start = useCallback(
    async (modelId: string) => {
      setError(null);
      setBusy(true);
      try {
        const next = await llmIpc.startServer(modelId);
        setStatus(next);
        onStarted?.(next);
      } catch (err) {
        setError(asLlmServerCommandError(err).kind);
      } finally {
        setBusy(false);
      }
    },
    [onStarted],
  );

  const stop = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      await llmIpc.stopServer();
      setStatus(IDLE_STATUS);
    } catch (err) {
      setError(asLlmServerCommandError(err).kind);
    } finally {
      setBusy(false);
    }
  }, []);

  return { status, loading, busy, error, start, stop, refresh };
}
