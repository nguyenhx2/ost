import { useCallback, useEffect, useState } from "react";
import {
  asHotkeyCommandError,
  hotkeysIpc,
  type HotkeyAction,
  type HotkeyCommandError,
  type HotkeyConfig,
} from "../lib/ipc";
import { eventToAccelerator } from "../lib/accelerator";

export interface UseHotkeysResult {
  /** The effective bindings, or null before the first load. */
  config: HotkeyConfig | null;
  loading: boolean;
  /** The action currently being re-bound (recording keystrokes), or null. */
  recording: HotkeyAction | null;
  /** Last reconfigure failure, or null. */
  error: HotkeyCommandError | null;
  /** Begin capturing the next chord for `action` (AC-04.1 reconfigure). */
  startRecording: (action: HotkeyAction) => void;
  /** Abort capture without changing the binding. */
  cancelRecording: () => void;
}

/**
 * Settings-side global-hotkey controls (FR-04, AC-04.1). Rust owns registration
 * + persistence (tauri-plugin-store); this hook reads the effective config and,
 * while "recording", captures the next valid chord and submits it. A rejected
 * `set` (invalid / duplicate / OS conflict) surfaces a typed error and leaves the
 * previous bindings intact - the hotkeys are only the app's own actions, never an
 * outbound send/type (human-in-the-loop.md).
 */
export function useHotkeys(): UseHotkeysResult {
  const [config, setConfig] = useState<HotkeyConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [recording, setRecording] = useState<HotkeyAction | null>(null);
  const [error, setError] = useState<HotkeyCommandError | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const loaded = await hotkeysIpc.get();
        if (active) {
          setConfig(loaded);
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

  const startRecording = useCallback((action: HotkeyAction) => {
    setError(null);
    setRecording(action);
  }, []);

  const cancelRecording = useCallback(() => setRecording(null), []);

  useEffect(() => {
    if (recording === null || config === null) {
      return;
    }
    const onKeyDown = (e: KeyboardEvent) => {
      // Escape aborts the capture without rebinding.
      if (e.key === "Escape") {
        e.preventDefault();
        setRecording(null);
        return;
      }
      const accelerator = eventToAccelerator(e);
      if (accelerator === null) {
        // Incomplete chord (modifier-only / no strong modifier / unmappable):
        // swallow and keep waiting for a complete combo.
        e.preventDefault();
        return;
      }
      e.preventDefault();
      const next: HotkeyConfig = { ...config, [recording]: accelerator };
      setRecording(null);
      void (async () => {
        try {
          const applied = await hotkeysIpc.set(next);
          setConfig(applied);
          setError(null);
        } catch (err) {
          setError(asHotkeyCommandError(err));
        }
      })();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [recording, config]);

  return {
    config,
    loading,
    recording,
    error,
    startRecording,
    cancelRecording,
  };
}
