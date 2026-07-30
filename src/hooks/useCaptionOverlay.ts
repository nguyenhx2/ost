import { useCallback, useEffect, useRef, useState } from "react";
import {
  asAudioCommandError,
  audioIpc,
  captionIpc,
  copyToClipboard,
  EVENT_AUDIO_CAPTION,
  EVENT_AUDIO_ERROR,
  EVENT_AUDIO_PAUSED,
  EVENT_AUDIO_RESUMED,
  EVENT_AUDIO_STOPPED,
  EVENT_MODELS_CONSENT_REQUIRED,
  isAudioSourceKind,
  keysIpc,
  listenIpc,
  modelIpc,
  settingsIpc,
  WHISPER_MODEL_SET_ID,
  type AudioCaptionPayload,
  type AudioCommandError,
  type AudioErrorPayload,
  type AudioSessionRequest,
  type AudioSessionStatusPayload,
  type ConsentDisclosure,
} from "../lib/ipc";
import { loadAudioSourcePreference } from "../lib/audioSource";
import { recordTranslation } from "../lib/history";
import { DEFAULT_TARGET_LANGUAGE } from "../lib/languages";
import { hasAnyProviderKey } from "../lib/providerKeys";
import { isValidLocalBaseUrl } from "../lib/localProvider";
import { LOCAL_OPENAI_PROVIDER_ID } from "../lib/providers";
import { loadProviderSettings } from "../lib/settings";

/**
 * A session-level start failure the overlay surfaces (never a raw backend
 * string). `noProviderKey` gets a Settings CTA (AC-01.11); `consentRequired` is
 * NOT an error here - the disclosure dialog handles it; every other kind maps
 * to a single generic "could not start" message (human-in-the-loop.md).
 */
export type CaptionStartError = AudioCommandError | null;

/**
 * Session lifecycle distinct from the overlay WINDOW's own lifecycle (item 2,
 * owner-reported: no way to pause or stop without losing the overlay).
 * `stopped` keeps the window and its accumulated transcript intact - only
 * `close()` tears the window down too.
 */
export type CaptionSessionState = "running" | "paused" | "stopped";

export interface CaptionOverlayState {
  /** The most recent translated caption, or null before the first one - drives
   * the default COMPACT presentation. */
  caption: AudioCaptionPayload | null;
  /**
   * Every completed caption this window has seen, ordered by `sequence`
   * (item 3, the owner's biggest complaint: the old code overwrote this with
   * `setCaption(payload)` so only the latest chunk ever existed). Drives the
   * secondary full-transcript view; never mutates past entries in place.
   */
  captions: AudioCaptionPayload[];
  /** `true` briefly after an `audio:error` chunk (localized, never raw). */
  chunkError: boolean;
  /** Session start failure to surface, or null. */
  startError: CaptionStartError;
  /**
   * One-call session snapshot fetched AT MOUNT (item 1, owner-reported: the
   * overlay never showed which models were running - the gap was worst
   * before the first `audio:caption`, which can be many seconds away).
   */
  status: AudioSessionStatusPayload | null;
  sessionState: CaptionSessionState;
}

export interface UseCaptionOverlayResult {
  state: CaptionOverlayState;
  /** Copy the current caption's translated text (AC-04.8 clipboard-only). */
  copyTranslation: () => void;
  /** Copy the current caption's transcribed source text. */
  copySource: () => void;
  /** Copy every accumulated caption (source + translation), in sequence order. */
  copyTranscript: () => void;
  /** Whether a copy just happened (drives aria-live feedback). */
  copied: "source" | "translation" | "transcript" | null;
  pinned: boolean;
  togglePin: () => void;
  /** Esc dismiss - ignored while pinned; otherwise stops + closes. */
  dismiss: () => void;
  /** Explicit close - always stops the session and closes the window. */
  close: () => void;
  /** Pause the running session WITHOUT closing the window (item 2). Idempotent. */
  pause: () => void;
  /** Resume a paused session (item 2). Idempotent. */
  resume: () => void;
  /** Stop the session but keep the window and its transcript (item 2). Idempotent. */
  stop: () => void;
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
  const [captions, setCaptions] = useState<AudioCaptionPayload[]>([]);
  const [chunkError, setChunkError] = useState(false);
  const [startError, setStartError] = useState<CaptionStartError>(null);
  const [copied, setCopied] = useState<
    "source" | "translation" | "transcript" | null
  >(null);
  const [pinned, setPinned] = useState(false);
  const [consentDisclosure, setConsentDisclosure] =
    useState<ConsentDisclosure | null>(null);
  const [consentDialogOpen, setConsentDialogOpen] = useState(false);
  const [status, setStatus] = useState<AudioSessionStatusPayload | null>(null);
  const [sessionState, setSessionState] =
    useState<CaptionSessionState>("running");

  const captionRef = useRef<AudioCaptionPayload | null>(null);
  const captionsRef = useRef<AudioCaptionPayload[]>([]);
  const requestRef = useRef(request);
  requestRef.current = request;

  const startSession = useCallback(async () => {
    setStartError(null);
    const request = requestRef.current;
    // Item 4 (audio source): the caption-overlay window is a fresh WebView
    // navigation that only receives provider/model/language NAMES via its URL
    // query (`shell/caption.rs`, Platform Shell context) - it does not carry
    // this preference across that boundary today. Resolve it the SAME way the
    // `local_openai` branch below resolves `baseUrl`: read the persisted
    // preference fresh (the SAME `settings.json` key the Rust core itself
    // writes on a successful start, src/lib/audioSource.ts) whenever the
    // request itself did not already carry one.
    const audioSource =
      request.audioSource ??
      (await loadAudioSourcePreference().catch(() => undefined));
    // The local OpenAI-compatible provider needs no key at all (BR-02): check
    // it FIRST, independently of the key-status check below, so a doomed
    // session never spins up capture and the actionable "set the server URL"
    // notice is never shadowed by a "no key" one (owner-reported bug -
    // human-in-the-loop.md). Falls through to the backend's own mapping if
    // the settings read itself fails - best-effort fast path only.
    if (request.provider === LOCAL_OPENAI_PROVIDER_ID) {
      try {
        const settings = await loadProviderSettings();
        const baseUrl = settings.localOpenAi.baseUrl;
        if (!isValidLocalBaseUrl(baseUrl)) {
          setStartError({ kind: "localNotConfigured" });
          return;
        }
        try {
          await audioIpc.start({ ...request, baseUrl, audioSource });
        } catch (err) {
          const typed = asAudioCommandError(err);
          if (typed.kind !== "consentRequired") {
            setStartError(typed);
          }
        }
        return;
      } catch {
        // Ignore - fall through to the ordinary start attempt below, which
        // still fails closed via the backend's own LocalNotConfigured mapping.
      }
    }
    // Detect the zero-key state client-side BEFORE attempting to start the
    // session, so a session with no chance of translating never spins up
    // capture (human-in-the-loop.md). Falls through to the ordinary start
    // attempt (and its backend-mapped error) if the status check itself
    // fails - this is a best-effort fast path, not the only defense.
    try {
      const statuses = await keysIpc.statuses();
      if (!hasAnyProviderKey(statuses)) {
        setStartError({ kind: "noProviderKey" });
        return;
      }
    } catch {
      // Ignore - fall back to the backend's own noProviderKey mapping below.
    }
    try {
      await audioIpc.start({ ...request, audioSource });
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
      // A caption only ever arrives for a running session.
      setSessionState("running");
      // Item 3 (accumulate, never overwrite): append/replace by `sequence`
      // and keep the list ordered, instead of the old `setCaption` overwrite
      // that left only the latest chunk visible.
      setCaptions((prev) => {
        const next = prev.filter((c) => c.sequence !== payload.sequence);
        next.push(payload);
        next.sort((a, b) => a.sequence - b.sequence);
        captionsRef.current = next;
        return next;
      });
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

    // Item 2 (pause/resume/stop): these are edges, not periodic state (ipc.md)
    // - a no-op pause/resume never re-emits, so this listener is the ONLY
    // authority for reflecting a transition that may have been triggered
    // elsewhere (tray/hotkey), not just from this window's own controls.
    const onPaused = () => setSessionState("paused");
    const onResumed = () => setSessionState("running");
    // `audio:stopped` also fires when the session is stopped from OUTSIDE this
    // window (tray/hotkey/Settings) - reflect that here too so the controls
    // never show a running session that has actually ended.
    const onStopped = () => setSessionState("stopped");

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
      const un4 = await listenIpc<undefined>(EVENT_AUDIO_PAUSED, onPaused);
      const un5 = await listenIpc<undefined>(EVENT_AUDIO_RESUMED, onResumed);
      const un6 = await listenIpc<undefined>(EVENT_AUDIO_STOPPED, onStopped);
      if (disposed) {
        un1();
        un2();
        un3();
        un4();
        un5();
        un6();
        return;
      }
      unlistens.push(un1, un2, un3, un4, un5, un6);
      // Listeners attached; now start the session this overlay was opened for.
      await startSession();
    })();

    return () => {
      disposed = true;
      unlistens.forEach((un) => un());
    };
  }, [startSession]);

  // Item 1 (model transparency): fetch the session snapshot once at mount,
  // independently of the listener/start effect above, so the STT model badge
  // has something to show even before `start_audio_session` itself resolves -
  // not just before the first `audio:caption`.
  useEffect(() => {
    let disposed = false;
    void audioIpc
      .getStatus()
      .then((snapshot) => {
        if (!disposed) {
          setStatus(snapshot);
        }
      })
      .catch(() => {
        // Best effort - the compact view still shows the request's own
        // provider/model; only the STT-model badge stays unpopulated.
      });
    return () => {
      disposed = true;
    };
  }, []);

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

  const copyTranscript = useCallback(() => {
    const current = captionsRef.current;
    if (current.length === 0) {
      return;
    }
    const text = current
      .map((c) => `${c.sourceText}\n${c.translatedText}`)
      .join("\n\n");
    void copyToClipboard(text);
    setCopied("transcript");
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

  // Item 2: pause/resume/stop are DISTINCT from close() - none of them touch
  // the overlay window. `sessionState` is set optimistically from the
  // resolved command (the listeners above are the fallback for externally
  // triggered transitions).
  const pause = useCallback(() => {
    void audioIpc.pause().then(() => setSessionState("paused"));
  }, []);

  const resume = useCallback(() => {
    void audioIpc.resume().then(() => setSessionState("running"));
  }, []);

  const stop = useCallback(() => {
    void audioIpc.stop().then(() => setSessionState("stopped"));
  }, []);

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
    state: { caption, captions, chunkError, startError, status, sessionState },
    copyTranslation,
    copySource,
    copyTranscript,
    copied,
    pinned,
    togglePin,
    dismiss,
    close,
    pause,
    resume,
    stop,
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
 * `audioSource` is read here for forward-compatibility ONLY (`shell/caption.rs`
 * does not carry it today, see `src/lib/audioSource.ts`); `startSession` above
 * falls back to the persisted preference whenever it is absent.
 */
export function parseCaptionRequest(search: string): AudioSessionRequest {
  const params = new URLSearchParams(search);
  const source = params.get("source") ?? "";
  const target = params.get("target") ?? "";
  const audioSourceParam = params.get("audioSource");
  return {
    provider: params.get("provider") ?? "",
    model: params.get("model") ?? "",
    sourceLanguage: source === "" ? undefined : source,
    targetLanguage: target === "" ? undefined : target,
    audioSource: isAudioSourceKind(audioSourceParam)
      ? audioSourceParam
      : undefined,
  };
}
