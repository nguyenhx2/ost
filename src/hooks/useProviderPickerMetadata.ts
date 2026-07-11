import { useEffect, useState } from "react";
import { providersIpc, type ProviderPickerMetadata } from "../lib/ipc";

export interface UseProviderPickerMetadataResult {
  /** Picker metadata for every translation provider, including the local
   * OpenAI-compatible one (FR-03.CUSTOM-1). Empty while loading/on failure -
   * the caller falls back to its own static list. */
  metadata: ProviderPickerMetadata[];
  loading: boolean;
}

/**
 * Loads the translation-provider picker metadata (`provider_picker_metadata`)
 * once on mount, so the "Active provider" Select can render the local
 * OpenAI-compatible entry (`requires_base_url`) without a second hardcoded
 * list (providers.md).
 */
export function useProviderPickerMetadata(): UseProviderPickerMetadataResult {
  const [metadata, setMetadata] = useState<ProviderPickerMetadata[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const next = await providersIpc.pickerMetadata();
        if (active) {
          setMetadata(next);
        }
      } catch {
        // Keep the empty list; the caller falls back to its static options.
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

  return { metadata, loading };
}
