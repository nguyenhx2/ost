import { useCallback, useEffect, useRef, useState } from "react";
import {
  copyToClipboard,
  EVENT_REGION_OCR_RESULT,
  EVENT_REGION_TRANSLATION_ERROR,
  EVENT_REGION_TRANSLATION_RESULT,
  listenIpc,
  regionIpc,
  type OcrResultPayload,
  type TranslationErrorPayload,
  type TranslationResultPayload,
} from "../lib/ipc";
import {
  DEFAULT_PROVIDER_OPTION,
  type ProviderModelOption,
} from "../lib/providers";

export type PreviewStatus =
  /** Waiting for the first OCR event after region confirm. */
  | "waitingOcr"
  /** OCR found no text (AC-02.7) - no translate request is sent. */
  | "empty"
  /** Source text shown, translation pending (AC-02.3 two-phase). */
  | "translating"
  /** Translation received. */
  | "translated"
  /**
   * Translation could not be completed - provider/network error or timeout.
   * The UI surfaces the failure and the re-translate escape hatch instead of
   * hanging on "translating" forever (human-in-the-loop.md, BR-05).
   */
  | "failed";

/** Why a translation ended in the "failed" state (drives the error copy). */
export type PreviewFailureReason = "error" | "timeout";

export interface PreviewState {
  status: PreviewStatus;
  sourceText: string;
  /** Pipeline-provided low-confidence flag (AC-02.6); no UI-side threshold. */
  lowConfidence: boolean;
  translation: string | null;
  /** Provider/model that actually produced the translation (AC-03.5 badge). */
  provider: string | null;
  model: string | null;
  /** Set only in the "failed" state; null otherwise. */
  failureReason: PreviewFailureReason | null;
}

const INITIAL_STATE: PreviewState = {
  status: "waitingOcr",
  sourceText: "",
  lowConfidence: false,
  translation: null,
  provider: null,
  model: null,
  failureReason: null,
};

const COPY_FEEDBACK_MS = 2000;

/**
 * Upper bound for a single translation before the UI declares it failed.
 * NFR-PERF-02 targets region translate p95 < 2s; this gives generous headroom
 * over that budget so a genuinely slow provider is not cut off, while still
 * guaranteeing the overlay never hangs on "translating" indefinitely.
 */
const TRANSLATION_TIMEOUT_MS = 8000;

export interface UseRegionPreviewResult {
  state: PreviewState;
  option: ProviderModelOption;
  /** One-interaction provider/model switch before re-translate (AC-02.8). */
  setOption: (option: ProviderModelOption) => void;
  retranslate: () => void;
  copySource: () => void;
  copyTranslation: () => void;
  /** Which text was just copied (drives the aria-live feedback). */
  copied: "source" | "translation" | null;
  pinned: boolean;
  togglePin: () => void;
  liveUpdate: boolean;
  setLiveUpdate: (enabled: boolean) => void;
  /** Explicit close (button) - always closes, even when pinned. */
  close: () => void;
  /** Esc dismiss - ignored while pinned (AC-04.3 pin semantics). */
  dismiss: () => void;
  /** Keyboard reposition of the overlay window (AC-04.3). */
  nudge: (dx: number, dy: number) => void;
}

/**
 * State machine for the SCR-03 preview overlay against the FR-02 pipeline
 * events. Source text renders as soon as the OCR event arrives; the
 * translation fills in from its own event (AC-02.3). Empty OCR never
 * triggers a translate request (AC-02.7).
 */
export function useRegionPreview(): UseRegionPreviewResult {
  const [state, setState] = useState<PreviewState>(INITIAL_STATE);
  const [option, setOptionState] = useState<ProviderModelOption>(
    DEFAULT_PROVIDER_OPTION,
  );
  const [copied, setCopied] = useState<"source" | "translation" | null>(null);
  const [pinned, setPinned] = useState(false);
  const [liveUpdate, setLiveUpdateState] = useState(true);

  const optionRef = useRef(option);
  const sourceTextRef = useRef("");
  const translationRef = useRef<string | null>(null);
  const requestIdRef = useRef<string | null>(null);
  const seqRef = useRef(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTranslationTimeout = useCallback(() => {
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const requestTranslation = useCallback(
    (sourceText: string) => {
      const requestId = `ui-${(seqRef.current += 1)}`;
      requestIdRef.current = requestId;
      const { provider, model } = optionRef.current;
      clearTranslationTimeout();
      timeoutRef.current = setTimeout(() => {
        timeoutRef.current = null;
        // Only the still-pending request may time out; a delivered result or a
        // superseding request has already cleared this timer.
        if (
          requestIdRef.current === requestId &&
          translationRef.current === null
        ) {
          setState((prev) =>
            prev.status === "translating"
              ? { ...prev, status: "failed", failureReason: "timeout" }
              : prev,
          );
        }
      }, TRANSLATION_TIMEOUT_MS);
      void regionIpc.requestTranslation({
        requestId,
        sourceText,
        provider,
        model,
      });
    },
    [clearTranslationTimeout],
  );

  useEffect(() => {
    const unlistens: Array<() => void> = [];
    let disposed = false;

    const onOcr = (payload: OcrResultPayload) => {
      const sourceText = payload.sourceText;
      if (sourceText.trim() === "") {
        // AC-02.7: empty OCR -> empty state, NO translate request.
        clearTranslationTimeout();
        requestIdRef.current = null;
        sourceTextRef.current = "";
        translationRef.current = null;
        setState((prev) => ({
          ...INITIAL_STATE,
          status: "empty",
          provider: prev.provider,
          model: prev.model,
        }));
        return;
      }
      sourceTextRef.current = sourceText;
      translationRef.current = null;
      setState((prev) => ({
        status: "translating",
        sourceText,
        lowConfidence: payload.lowConfidence,
        translation: null,
        provider: prev.provider,
        model: prev.model,
        failureReason: null,
      }));
      requestTranslation(sourceText);
    };

    const onTranslation = (payload: TranslationResultPayload) => {
      if (payload.requestId !== requestIdRef.current) {
        return; // stale response from a superseded request
      }
      clearTranslationTimeout();
      translationRef.current = payload.translatedText;
      setState((prev) => ({
        ...prev,
        status: "translated",
        translation: payload.translatedText,
        provider: payload.provider,
        model: payload.model,
        failureReason: null,
      }));
    };

    const onTranslationError = (payload: TranslationErrorPayload) => {
      if (payload.requestId !== requestIdRef.current) {
        return; // stale error from a superseded request
      }
      clearTranslationTimeout();
      translationRef.current = null;
      setState((prev) =>
        prev.status === "translating"
          ? { ...prev, status: "failed", failureReason: "error" }
          : prev,
      );
    };

    void (async () => {
      const un1 = await listenIpc<OcrResultPayload>(
        EVENT_REGION_OCR_RESULT,
        onOcr,
      );
      const un2 = await listenIpc<TranslationResultPayload>(
        EVENT_REGION_TRANSLATION_RESULT,
        onTranslation,
      );
      const un3 = await listenIpc<TranslationErrorPayload>(
        EVENT_REGION_TRANSLATION_ERROR,
        onTranslationError,
      );
      if (disposed) {
        un1();
        un2();
        un3();
        return;
      }
      unlistens.push(un1, un2, un3);
      // Handshake: listeners are attached, the pipeline may emit now.
      await regionIpc.previewReady();
    })();

    return () => {
      disposed = true;
      clearTranslationTimeout();
      unlistens.forEach((un) => un());
    };
  }, [requestTranslation, clearTranslationTimeout]);

  useEffect(() => {
    if (copied === null) {
      return;
    }
    const timer = setTimeout(() => setCopied(null), COPY_FEEDBACK_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  const setOption = useCallback((next: ProviderModelOption) => {
    optionRef.current = next;
    setOptionState(next);
  }, []);

  const retranslate = useCallback(() => {
    const sourceText = sourceTextRef.current;
    if (sourceText.trim() === "") {
      return; // nothing to translate (AC-02.7 guard)
    }
    translationRef.current = null;
    setState((prev) => ({
      ...prev,
      status: "translating",
      translation: null,
      failureReason: null,
    }));
    requestTranslation(sourceText);
  }, [requestTranslation]);

  const copySource = useCallback(() => {
    if (sourceTextRef.current !== "") {
      void copyToClipboard(sourceTextRef.current);
      setCopied("source");
    }
  }, []);

  const copyTranslation = useCallback(() => {
    if (translationRef.current !== null) {
      void copyToClipboard(translationRef.current);
      setCopied("translation");
    }
  }, []);

  const togglePin = useCallback(() => setPinned((p) => !p), []);

  const setLiveUpdate = useCallback((enabled: boolean) => {
    setLiveUpdateState(enabled);
    void regionIpc.setLiveUpdate(enabled);
  }, []);

  const close = useCallback(() => {
    void regionIpc.closePreview();
  }, []);

  const dismiss = useCallback(() => {
    if (!pinned) {
      void regionIpc.closePreview();
    }
  }, [pinned]);

  const nudge = useCallback((dx: number, dy: number) => {
    void regionIpc.nudgePreview(dx, dy);
  }, []);

  return {
    state,
    option,
    setOption,
    retranslate,
    copySource,
    copyTranslation,
    copied,
    pinned,
    togglePin,
    liveUpdate,
    setLiveUpdate,
    close,
    dismiss,
    nudge,
  };
}
