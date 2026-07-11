import { useCallback, useState } from "react";
import {
  asLocalProviderCommandError,
  providersIpc,
  type LocalProviderErrorKind,
} from "../lib/ipc";

export type LocalProviderCheckState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "ok" }
  | { status: "error"; kind: LocalProviderErrorKind };

export interface UseLocalProviderConnectionResult {
  state: LocalProviderCheckState;
  /** Validate `base_url` (loopback-only) and probe connectivity BEFORE the
   * caller persists it (FR-03.CUSTOM-2). Never throws. */
  check: (baseUrl: string) => Promise<void>;
  reset: () => void;
}

/**
 * Connectivity check for the local OpenAI-compatible translation provider
 * (LM Studio and similar, FR-03.CUSTOM-1..5). Distinguishes
 * `localServerUnreachable` ("the local server is not running") from a plain
 * `invalidBaseUrl`/`network`/`timeout`/`provider` failure so the UI can show
 * the right message (providers.md).
 */
export function useLocalProviderConnection(): UseLocalProviderConnectionResult {
  const [state, setState] = useState<LocalProviderCheckState>({
    status: "idle",
  });

  const check = useCallback(async (baseUrl: string) => {
    setState({ status: "checking" });
    try {
      await providersIpc.checkLocalConnection(baseUrl);
      setState({ status: "ok" });
    } catch (err) {
      setState({
        status: "error",
        kind: asLocalProviderCommandError(err).kind,
      });
    }
  }, []);

  const reset = useCallback(() => setState({ status: "idle" }), []);

  return { state, check, reset };
}
