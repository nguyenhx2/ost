import { useCallback, useEffect, useState } from "react";
import {
  audioIpc,
  captionIpc,
  modelIpc,
  WHISPER_MODEL_SET_ID,
  type ModelConsentStatus,
} from "../lib/ipc";
import {
  DEFAULT_SOURCE_LANGUAGE,
  DEFAULT_TARGET_LANGUAGE,
} from "../lib/languages";

/** A failed session-control action the Settings UI can surface. */
export type AudioSessionActionError = "start" | null;

export interface UseAudioSessionResult {
  /** Pinned source language (AC-01.4); default Auto. */
  sourceLanguage: string;
  setSourceLanguage: (code: string) => void;
  /** Target language (AC-01.5); default `vi`. */
  targetLanguage: string;
  setTargetLanguage: (code: string) => void;
  /** Whether a session has been started from this control (optimistic). */
  running: boolean;
  /** Last control failure, or null. */
  error: AudioSessionActionError;
  /** Whisper model consent status (recommended model display + first-run). */
  whisper: ModelConsentStatus | null;
  whisperLoading: boolean;
  /** Whether the whisper consent disclosure dialog is open (proactive grant). */
  consentDialogOpen: boolean;
  openConsent: () => void;
  declineConsent: () => void;
  grantConsent: () => void;
  /**
   * Start a session: open the always-on-top caption overlay for the request,
   * which owns the session lifecycle (it calls `start_audio_session`). The
   * request carries NAMES only - provider/model ids + language codes (BR-02).
   */
  start: (provider: string, model: string) => void;
  /** Stop the session and close the overlay window (AC-01.10). Idempotent. */
  stop: () => void;
}

/**
 * Settings-side controls for the live audio session (FR-01, AC-01.4/01.5/01.8).
 * Owns the source/target language selection and the whisper model consent
 * surface, and opens/closes the caption overlay. The overlay window is the one
 * that actually starts the session (it holds the request and re-signals after a
 * consent grant); Settings just configures and launches it.
 */
export function useAudioSession(): UseAudioSessionResult {
  const [sourceLanguage, setSourceLanguage] = useState(DEFAULT_SOURCE_LANGUAGE);
  const [targetLanguage, setTargetLanguage] = useState(DEFAULT_TARGET_LANGUAGE);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<AudioSessionActionError>(null);
  const [whisper, setWhisper] = useState<ModelConsentStatus | null>(null);
  const [whisperLoading, setWhisperLoading] = useState(true);
  const [consentDialogOpen, setConsentDialogOpen] = useState(false);

  const refreshWhisper = useCallback(async () => {
    const status = await modelIpc.consentStatus(WHISPER_MODEL_SET_ID);
    setWhisper(status);
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const status = await modelIpc.consentStatus(WHISPER_MODEL_SET_ID);
        if (active) {
          setWhisper(status);
        }
      } finally {
        if (active) {
          setWhisperLoading(false);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const start = useCallback(
    (provider: string, model: string) => {
      setError(null);
      void (async () => {
        try {
          await captionIpc.openOverlay({
            provider,
            model,
            sourceLanguage,
            targetLanguage,
          });
          setRunning(true);
        } catch {
          setError("start");
        }
      })();
    },
    [sourceLanguage, targetLanguage],
  );

  const stop = useCallback(() => {
    void (async () => {
      await audioIpc.stop();
      await captionIpc.closeOverlay();
      setRunning(false);
    })();
  }, []);

  const openConsent = useCallback(() => setConsentDialogOpen(true), []);
  const declineConsent = useCallback(() => setConsentDialogOpen(false), []);

  const grantConsent = useCallback(() => {
    void (async () => {
      await modelIpc.grantConsent(WHISPER_MODEL_SET_ID);
      setConsentDialogOpen(false);
      await refreshWhisper();
    })();
  }, [refreshWhisper]);

  return {
    sourceLanguage,
    setSourceLanguage,
    targetLanguage,
    setTargetLanguage,
    running,
    error,
    whisper,
    whisperLoading,
    consentDialogOpen,
    openConsent,
    declineConsent,
    grantConsent,
    start,
    stop,
  };
}
