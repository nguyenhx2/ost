import { useCallback, useEffect, useState } from "react";
import type { SourceLanguage } from "../lib/ipc";
import {
  DEFAULT_REGION_LANGUAGE_SETTINGS,
  loadRegionLanguageSettings,
  saveRegionLanguageSettings,
  type RegionLanguageSettings,
} from "../lib/regionLanguageSettings";

export interface UseRegionLanguageSettingsResult {
  settings: RegionLanguageSettings;
  loading: boolean;
  setSourceLanguage: (language: SourceLanguage) => void;
  setTargetLanguage: (language: string) => void;
}

/**
 * Home-screen picker for the region-translate language defaults (item 3):
 * the SAME persisted preference `useRegionSelection` (source) and
 * `useRegionPreview` (target) read, so choosing it here changes the default
 * for the NEXT region selection anywhere in the app.
 */
export function useRegionLanguageSettings(): UseRegionLanguageSettingsResult {
  const [settings, setSettings] = useState<RegionLanguageSettings>(
    DEFAULT_REGION_LANGUAGE_SETTINGS,
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void loadRegionLanguageSettings()
      .then((loaded) => {
        if (!cancelled) {
          setSettings(loaded);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setSourceLanguage = useCallback((language: SourceLanguage) => {
    setSettings((prev) => {
      const next = { ...prev, sourceLanguage: language };
      void saveRegionLanguageSettings(next).catch(() => undefined);
      return next;
    });
  }, []);

  const setTargetLanguage = useCallback((language: string) => {
    setSettings((prev) => {
      const next = { ...prev, targetLanguage: language };
      void saveRegionLanguageSettings(next).catch(() => undefined);
      return next;
    });
  }, []);

  return { settings, loading, setSourceLanguage, setTargetLanguage };
}
