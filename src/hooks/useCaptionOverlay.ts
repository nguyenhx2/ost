import { useCallback, useEffect, useRef, useState } from "react";
import {
  asAudioCommandError,
  audioIpc,
  captionIpc,
  copyToClipboard,
  EVENT_AUDIO_CAPTION,
  EVENT_AUDIO_ERROR,
  EVENT_MODELS_CONSENT_REQUIRED,
  listenIpc,
  modelIpc,
  settingsIpc,
  WHISPER_MODEL_SET_ID,
  type AudioCaptionPayload,
  type AudioCommandError,
  type AudioErrorPayload,
  type AudioSessionRequest,
  type ConsentDisclosure,
} from "../lib/ipc";
import { recordTranslation } from "../lib/history";
import { DEFAULT_TARGET_LANGUAGE } from "../lib/languages";

/**
 * A session-level start failure the overlay surfaces (never a raw backend
 * string). `noProviderKey` gets a Settings CTA (AC-01.11); `consentRequired` is
 * NOT an error here - the disclosure dialog handles it; every other kind maps
 * to a single generic "could not start" message (human-in-the-loop.md).
 */
export type CaptionStartError = AudioCommandError | null;

export interface CaptionOverlayState {
  /** The most recent translated caption, or null before the first one. */
  caption: AudioCaptionPayload | null;
  /** `true` briefly after an `audio:error` chunk (localized, never raw). */
  chunkError: boolean;
  /** Session start failure to surface, or null. */
  startError: CaptionStartError;
}

export interface UseCaptionOverlayResult {
  state: CaptionOverlayState;
  /** Copy the current caption's translated text (AC-04.8 clipboard-only). */
  copyTranslation: () => void;
  /** Copy the current caption's transcribed source text. */
  copySource: () => void;
  /** Whether a copy just happened (drives aria-live feedback). */
  copied: "source" | "translation" | null;
  pinned: boolean;
  togglePin: () => void;
  /** Esc dismiss - ignored while pinned; otherwise stops + closes. */
  dismiss: () => void;
  /** Explicit close - always stops the session and closes the window. */
  close: () => void;
  /** Keyboard reposition of the overlay window (AC-04.3). */
  nudge: (dx: number, dy: number) => void;
  /** Open Settings (the CTA for a missing provider key, AC-01.11). */
  openSettings: () => void;
  /** Retry a failed session start (escape hatch, human-in-the-loop.md). */
  retry: () => void;
  /** Disclosure for the pending whisper download, or null when none. */
  consentDisclosure: ConsentDisclosure | null;
  consentDialogOpen: boolean;
  /** Grant download consent, then re-signal (re-start) the session. */
  grantConsent: () => void;
  /** Decline: close the dialog WITHOUT granting; captions stay blocked. */
  declineConsent: () => void;
  /** Re-open the consent dialog after declining. */
  reopenConsent: () => void;
}

const COPY_FEEDBACK_MS = 2000;
const CHUNK_ERROR_MS = 4000;

/**
 * State machine for the SCR-01 caption overlay against the FR-01 audio session.
 * The overlay OWNS the session it was opened for: it starts on mount, records
 * each completed caption to history (text-only), and re-signals the session
 * after a first-run model-consent grant. Audio never crosses IPC - only the
 * caption text arrives over `audio:caption` (security-privacy.md).
 */
export function useCaptionOverlay(
  request: AudioSessionRequest,
): UseCaptionOverlayResult {
  const [caption, setCaption] = useState<AudioCaptionPayload | null>(null);
  const [chunkError, setChunkError] = useState(false);
  const [startError, setStartError] = useState<CaptionStartError>(null);
  const [copied, setCopied] = useState<"source" | "translation" | null>(null);
  const [pinned, setPinned] = useState(false);
  const [consentDisclosure, setConsentDisclosure] =
    useState<ConsentDisclosure | null>(null);
  const [consentDialogOpen, setConsentDialogOpen] = useState(false);

  const captionRef = useRef<AudioCaptionPayload | null>(null);
  const requestRef = useRef(request);
  requestRef.current = request;

  const startSession = useCallback(async () => {
    setStartError(null);
    try {
      await audioIpc.start(requestRef.current);
    } catch (err) {
      const typed = asAudioCommandError(err);
      // consentRequired is handled by the disclosure dialog (via the event),
      // not surfaced as an error banner.
      if (typed.kind !== "consentRequired") {
        setStartError(typed);
      }
    }
  }, []);

  useEffect(() => {
    const unlistens: Array<() => void> = [];
    let disposed = false;

    const onCaption = (payload: AudioCaptionPayload) => {
      captionRef.current = payload;
      setChunkError(false);
      setStartError(null);
      setCaption(payload);
      // Recording seam (BR-06/AC-04.4): every COMPLETED caption is logged
      // text-only through the shared, serialized helper. Fire-and-forget - a
      // history-store failure must never break the caption UX. Audio and keys
      // NEVER enter this call (the helper whitelists HISTORY_ENTRY fields).
      void recordTranslation({
        sessionType: "audio",
        sourceText: payload.sourceText,
        translatedText: payload.translatedText,
        sourceLanguage: payload.sourceLanguage,
        targetLanguage: payload.targetLanguage || DEFAULT_TARGET_LANGUAGE,
        providerId: payload.provider,
        modelId: payload.model,
      }).catch(() => {
        // Swallowed by design: recording is best-effort, never user-facing.
      });
    };

    const onError = () => {
      // human-in-the-loop.md: no silent hang. The session keeps running; we flag
      // the transient failure with OUR localized copy - the raw message is DATA
      // and is intentionally NOT read here.
      setChunkError(true);
    };

    const onConsentRequired = (disclosure: ConsentDisclosure) => {
      // Fail-closed egress: the whisper download is blocked in Rust until the
      // user grants consent. Open the disclosure dialog (host/size/destination).
      setConsentDisclosure(disclosure);
      setConsentDialogOpen(true);
    };

    void (async () => {
      const un1 = await listenIpc<AudioCaptionPayload>(
        EVENT_AUDIO_CAPTION,
        onCaption,
      );
      const un2 = await listenIpc<AudioErrorPayload>(
        EVENT_AUDIO_ERROR,
        onError,
      );
      const un3 = await listenIpc<ConsentDisclosure>(
        EVENT_MODELS_CONSENT_REQUIRED,
        onConsentRequired,
      );
      if (disposed) {
        un1();
        un2();
        un3();
        return;
      }
      unlistens.push(un1, un2, un3);
      // Listeners attached; now start the session this overlay was opened for.
      await startSession();
    })();

    return () => {
      disposed = true;
      unlistens.forEach((un) => un());
    };
  }, [startSession]);

  useEffect(() => {
    if (copied === null) {
      return;
    }
    const timer = setTimeout(() => setCopied(null), COPY_FEEDBACK_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  useEffect(() => {
    if (!chunkError) {
      return;
    }
    const timer = setTimeout(() => setChunkError(false), CHUNK_ERROR_MS);
    return () => clearTimeout(timer);
  }, [chunkError]);

  const copyTranslation = useCallback(() => {
    const current = captionRef.current;
    if (current && current.translatedText !== "") {
      void copyToClipboard(current.translatedText);
      setCopied("translation");
    }
  }, []);

  const copySource = useCallback(() => {
    const current = captionRef.current;
    if (current && current.sourceText !== "") {
      void copyToClipboard(current.sourceText);
      setCopied("source");
    }
  }, []);

  const togglePin = useCallback(() => setPinned((p) => !p), []);

  const close = useCallback(() => {
    // Stop the session (idempotent) and tear the overlay window down.
    void (async () => {
      await audioIpc.stop();
      await captionIpc.closeOverlay();
    })();
  }, []);

  const dismiss = useCallback(() => {
    if (!pinned) {
      close();
    }
  }, [pinned, close]);

  const nudge = useCallback((dx: number, dy: number) => {
    void captionIpc.nudgeOverlay(dx, dy);
  }, []);

  const openSettings = useCallback(() => {
    void settingsIpc.open();
  }, []);

  const retry = useCallback(() => {
    void startSession();
  }, [startSession]);

  const grantConsent = useCallback(() => {
    void (async () => {
      await modelIpc.grantConsent(WHISPER_MODEL_SET_ID);
      setConsentDialogOpen(false);
      setConsentDisclosure(null);
      // Re-signal the session: the fail-closed gate is now open, so start again.
      await startSession();
    })();
  }, [startSession]);

  const declineConsent = useCallback(() => {
    // Close WITHOUT granting; captions stay blocked (no download).
    setConsentDialogOpen(false);
  }, []);

  const reopenConsent = useCallback(() => {
    if (consentDisclosure) {
      setConsentDialogOpen(true);
    }
  }, [consentDisclosure]);

  return {
    state: { caption, chunkError, startError },
    copyTranslation,
    copySource,
    copied,
    pinned,
    togglePin,
    dismiss,
    close,
    nudge,
    openSettings,
    retry,
    consentDisclosure,
    consentDialogOpen,
    grantConsent,
    declineConsent,
    reopenConsent,
  };
}

/**
 * Parse the caption overlay's session request from the window query string
 * (set by `shell/caption.rs` when it opens the window). NAMES only - never a
 * key or audio. Absent/empty language params fall through to the core defaults.
 */
export function parseCaptionRequest(search: string): AudioSessionRequest {
  const params = new URLSearchParams(search);
  const source = params.get("source") ?? "";
  const target = params.get("target") ?? "";
  return {
    provider: params.get("provider") ?? "",
    model: params.get("model") ?? "",
    sourceLanguage: source === "" ? undefined : source,
    targetLanguage: target === "" ? undefined : target,
  };
}
