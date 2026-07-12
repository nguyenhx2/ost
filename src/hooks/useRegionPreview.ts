import { useCallback, useEffect, useRef, useState } from "react";
import {
  copyToClipboard,
  EVENT_MODELS_CONSENT_REQUIRED,
  EVENT_REGION_OCR_ERROR,
  EVENT_REGION_OCR_RESULT,
  EVENT_REGION_SELECTED,
  EVENT_REGION_TRANSLATION_DELTA,
  EVENT_REGION_TRANSLATION_ERROR,
  EVENT_REGION_TRANSLATION_RESULT,
  listenIpc,
  modelIpc,
  regionIpc,
  settingsIpc,
  type ConsentDisclosure,
  type OcrErrorPayload,
  type OcrFidelity,
  type OcrResultPayload,
  type SourceLanguage,
  type TranslationDeltaPayload,
  type TranslationErrorPayload,
  type TranslationResultPayload,
} from "../lib/ipc";
import {
  DEFAULT_SOURCE_LANGUAGE,
  DEFAULT_TARGET_LANGUAGE,
} from "../lib/languages";
import {
  DEFAULT_PROVIDER_OPTION,
  type ProviderModelOption,
} from "../lib/providers";
import { activeModel, loadProviderSettings } from "../lib/settings";
import { recordTranslation } from "../lib/history";
import {
  loadRegionLanguageSettings,
  saveRegionLanguageSettings,
} from "../lib/regionLanguageSettings";
import {
  DEFAULT_REGION_PREVIEW_LAYOUT,
  loadRegionPreviewLayout,
  saveRegionPreviewLayout,
  type RegionPreviewLayout,
} from "../lib/regionLayoutSettings";
import { useHasAnyProviderKey } from "./useHasAnyProviderKey";

export type PreviewStatus =
  /** Waiting for the first OCR event after region confirm. */
  | "waitingOcr"
  /**
   * OCR is blocked pending first-run model-download consent (fail-closed).
   * The consent dialog is (or was) shown; nothing is recognized until granted.
   */
  | "consentRequired"
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

/**
 * Why the preview ended in the "failed" state (drives the error copy):
 * - `error`   translation provider/network error;
 * - `timeout` translation exceeded the client-side budget;
 * - `ocr`     capture/OCR failed (region:ocr-error) - never the raw message;
 * - `noKey`   NO provider has a key configured (detected client-side before
 *   ever sending a translate request) - a distinct, actionable notice, never
 *   the generic failure copy (human-in-the-loop.md).
 */
export type PreviewFailureReason = "error" | "timeout" | "ocr" | "noKey";

const FULL_FIDELITY: OcrFidelity = { kind: "full" };

export interface PreviewState {
  status: PreviewStatus;
  sourceText: string;
  /** Pipeline-provided low-confidence flag (AC-02.6); no UI-side threshold. */
  lowConfidence: boolean;
  /**
   * Recognition-fidelity declaration for the selected source language
   * (AC-02.6). `degraded` drives a STANDING notice independent of
   * `lowConfidence` (dropped diacritics are NOT confidence-flagged).
   */
  fidelity: OcrFidelity;
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
  fidelity: FULL_FIDELITY,
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
  /** Explicit close (button) - always closes, even when pinned. */
  close: () => void;
  /** Esc dismiss - ignored while pinned (AC-04.3 pin semantics). */
  dismiss: () => void;
  /** Keyboard reposition of the overlay window (AC-04.3). */
  nudge: (dx: number, dy: number) => void;
  /** Disclosure for the pending model download, or null when none. */
  consentDisclosure: ConsentDisclosure | null;
  /** Whether the consent dialog is currently open. */
  consentDialogOpen: boolean;
  /** Grant download consent, then re-arm the OCR pipeline (fail-closed gate). */
  grantConsent: () => void;
  /** Decline: close the dialog WITHOUT granting; OCR stays blocked. */
  declineConsent: () => void;
  /** Re-open the consent dialog after declining. */
  reopenConsent: () => void;
  /** Open Settings (the CTA for a missing provider key, human-in-the-loop.md). */
  openSettings: () => void;
  /**
   * Persisted source-language pin (BR-07, item 3): the default the NEXT region
   * selection uses (this dialog cannot retroactively re-run OCR for the
   * region already captured). Shared with the home screen and the select
   * overlay via `regionLanguageSettings`.
   */
  sourceLanguage: SourceLanguage;
  setSourceLanguage: (language: SourceLanguage) => void;
  /**
   * Target language for translation (item 3). Feeds every (re-)translate
   * request and the recorded history `targetLanguage`; persisted so it
   * survives across sessions (BR-07 default `vi`).
   */
  targetLanguage: string;
  setTargetLanguage: (language: string) => void;
  /**
   * Start a NEW region capture WITHOUT closing this dialog (item 1). Opens the
   * same fullscreen select overlay as the main screen/tray/hotkey; when the
   * user confirms, this SAME dialog refreshes for the new region (item 2 fix).
   */
  reselect: () => void;
  /**
   * Display layout (owner item 1): `stacked` (source over translation, the
   * original layout) or `columns` (side by side). Persisted so it sticks
   * across sessions.
   */
  layout: RegionPreviewLayout;
  setLayout: (layout: RegionPreviewLayout) => void;
  /**
   * The editable source text shown in the paste/edit field (owner item 2).
   * Tracks the OCR-provided text but can diverge while the user is actively
   * typing/pasting a replacement.
   */
  sourceDraft: string;
  /** Updates the draft WITHOUT sending a translate request (plain typing). */
  setSourceDraft: (text: string) => void;
  /**
   * Pasted plain text (untrusted DATA) replaces the source and immediately
   * requests a translation through the SAME path OCR text uses.
   */
  pasteSourceText: (text: string) => void;
  /**
   * Commits a manual edit (e.g. on blur) as a new translation request, same
   * path as OCR/paste - but only when the draft actually differs from the
   * text already shown, so leaving the field unchanged never re-fires.
   */
  commitSourceEdit: () => void;
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
  const [consentDisclosure, setConsentDisclosure] =
    useState<ConsentDisclosure | null>(null);
  const [consentDialogOpen, setConsentDialogOpen] = useState(false);
  const [sourceLanguage, setSourceLanguageState] = useState<SourceLanguage>(
    DEFAULT_SOURCE_LANGUAGE,
  );
  const [targetLanguage, setTargetLanguageState] = useState<string>(
    DEFAULT_TARGET_LANGUAGE,
  );
  const [layout, setLayoutState] = useState<RegionPreviewLayout>(
    DEFAULT_REGION_PREVIEW_LAYOUT,
  );
  const [sourceDraft, setSourceDraftState] = useState("");
  const { hasKey } = useHasAnyProviderKey();

  const optionRef = useRef(option);
  const hasKeyRef = useRef(hasKey);
  hasKeyRef.current = hasKey;
  const sourceLanguagePrefRef = useRef(sourceLanguage);
  const targetLanguageRef = useRef(targetLanguage);

  // Item 3 (language pickers): load the persisted preference on mount so this
  // dialog reflects whatever the user last chose (here or on the home
  // screen). An unreadable store must never break the overlay.
  useEffect(() => {
    let cancelled = false;
    void loadRegionLanguageSettings()
      .then((settings) => {
        if (cancelled) {
          return;
        }
        sourceLanguagePrefRef.current = settings.sourceLanguage;
        setSourceLanguageState(settings.sourceLanguage);
        targetLanguageRef.current = settings.targetLanguage;
        setTargetLanguageState(settings.targetLanguage);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  // Item 1 (layout toggle): load the persisted display layout on mount. An
  // unreadable store must never break the overlay - fall back to the default
  // (stacked, the original layout) instead of rejecting into an unhandled
  // error.
  useEffect(() => {
    let cancelled = false;
    void loadRegionPreviewLayout()
      .then((saved) => {
        if (!cancelled) {
          setLayoutState(saved);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  // Item 2 (paste/edit source): keep the editable draft in sync with the
  // OCR-provided source text whenever it changes (new region, re-select,
  // etc). A manual paste/edit updates `state.sourceText` itself (via
  // `pasteSourceText`/`commitSourceEdit` below), so this never fights an
  // in-flight edit with stale OCR output.
  useEffect(() => {
    setSourceDraftState(state.sourceText);
  }, [state.sourceText]);

  // AC-03.5: translate with the provider/model the user actually configured in
  // Settings. Without this the preview stayed on the hardcoded catalog default
  // (gemini) forever, so a user who configured a different provider got
  // "translation failed" from a provider they never set a key for.
  useEffect(() => {
    let cancelled = false;
    void loadProviderSettings()
      .then((settings) => {
        if (cancelled) {
          return;
        }
        const provider = settings.defaultProvider;
        const model = activeModel(settings);
        if (!model) {
          return;
        }
        const configured: ProviderModelOption = {
          id: `${provider}/${model}`,
          provider,
          model,
        };
        optionRef.current = configured;
        setOptionState(configured);
      })
      // An unreadable store must never break the overlay: fall back to the
      // catalog default instead of rejecting into an unhandled error.
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  const sourceTextRef = useRef("");
  /** Detected source language from the last OCR event (BR-07 hint), or "". */
  const sourceLanguageRef = useRef("");
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
        targetLanguage: targetLanguageRef.current,
      });
    },
    [clearTranslationTimeout],
  );

  /**
   * Shared core of "a source text arrived, (maybe) translate it" - used by
   * the OCR handler AND the paste/edit path (item 2) so both go through the
   * EXACT same state transitions and translate request (owner requirement:
   * pasted text translates "through the same path OCR text uses").
   */
  const beginTranslationForSource = useCallback(
    (
      sourceText: string,
      options: {
        lowConfidence?: boolean;
        fidelity?: OcrFidelity;
        detectedLanguage?: string;
      } = {},
    ) => {
      const {
        lowConfidence = false,
        fidelity = FULL_FIDELITY,
        detectedLanguage = "",
      } = options;
      if (sourceText.trim() === "") {
        // AC-02.7: empty source -> empty state, NO translate request.
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
      sourceLanguageRef.current = detectedLanguage;
      translationRef.current = null;
      // No provider key configured: this is a distinct, actionable state, not
      // a translation failure - never fire the doomed translate request
      // (human-in-the-loop.md, requirement to detect BEFORE attempting).
      if (!hasKeyRef.current) {
        setState((prev) => ({
          status: "failed",
          sourceText,
          lowConfidence,
          fidelity,
          translation: null,
          provider: prev.provider,
          model: prev.model,
          failureReason: "noKey",
        }));
        return;
      }
      setState((prev) => ({
        status: "translating",
        sourceText,
        lowConfidence,
        fidelity,
        translation: null,
        provider: prev.provider,
        model: prev.model,
        failureReason: null,
      }));
      requestTranslation(sourceText);
    },
    [clearTranslationTimeout, requestTranslation],
  );

  /**
   * Pasted plain text (untrusted DATA) replaces the source and immediately
   * translates through `beginTranslationForSource` - the SAME path OCR text
   * uses (owner item 2). No detected-language hint: a pasted string was never
   * recognized by the OCR engine.
   */
  const pasteSourceText = useCallback(
    (text: string) => {
      setSourceDraftState(text);
      beginTranslationForSource(text);
    },
    [beginTranslationForSource],
  );

  /**
   * Commits a manual edit of the source draft (e.g. on blur) as a new
   * translation request - but only when the draft actually differs from the
   * text already shown, so leaving the field untouched never re-fires a
   * request.
   */
  const commitSourceEdit = useCallback(() => {
    if (sourceDraft === sourceTextRef.current) {
      return;
    }
    beginTranslationForSource(sourceDraft);
  }, [sourceDraft, beginTranslationForSource]);

  const setSourceDraft = useCallback((text: string) => {
    setSourceDraftState(text);
  }, []);

  const setLayout = useCallback((next: RegionPreviewLayout) => {
    setLayoutState(next);
    void saveRegionPreviewLayout(next).catch(() => undefined);
  }, []);

  useEffect(() => {
    const unlistens: Array<() => void> = [];
    let disposed = false;

    const onOcr = (payload: OcrResultPayload) => {
      beginTranslationForSource(payload.sourceText, {
        lowConfidence: payload.lowConfidence,
        fidelity: payload.fidelity ?? FULL_FIDELITY,
        detectedLanguage: payload.detectedLanguage ?? "",
      });
    };

    const onOcrError = () => {
      // human-in-the-loop.md: no silent hang. Leave "recognizing" and show our
      // own localized copy - the raw diagnostic string is untrusted DATA.
      clearTranslationTimeout();
      requestIdRef.current = null;
      sourceTextRef.current = "";
      translationRef.current = null;
      setState((prev) => ({
        ...INITIAL_STATE,
        status: "failed",
        failureReason: "ocr",
        provider: prev.provider,
        model: prev.model,
      }));
    };

    const onConsentRequired = (disclosure: ConsentDisclosure) => {
      // Fail-closed egress: OCR is blocked in Rust until consent is granted.
      // Stop the "recognizing" spinner and open the disclosure dialog.
      clearTranslationTimeout();
      setConsentDisclosure(disclosure);
      setConsentDialogOpen(true);
      setState((prev) => ({
        ...INITIAL_STATE,
        status: "consentRequired",
        provider: prev.provider,
        model: prev.model,
      }));
    };

    const onTranslationDelta = (payload: TranslationDeltaPayload) => {
      if (payload.requestId !== requestIdRef.current) {
        return; // stale delta from a superseded request
      }
      // The FIRST delta proves the stream is producing output: clear the
      // client-side timeout right here (item 1b) - only a stream that
      // produces NOTHING within the budget is a real timeout/failure. Without
      // this a slow-but-live translation could still trip the false red
      // "timeout" error before the accumulated text (and eventual result)
      // ever renders.
      clearTranslationTimeout();
      translationRef.current = payload.text;
      setState((prev) =>
        prev.status === "translating"
          ? { ...prev, translation: payload.text }
          : prev,
      );
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
      // Recording seam (BR-06/AC-04.4): every COMPLETED translation is logged
      // text-only. The history lib skips this when recording is disabled and
      // strips anything outside the HISTORY_ENTRY field set. Fire-and-forget -
      // a history-store failure must never break the translation UX. The future
      // audio-caption path (TASK-015/016) records through this same helper.
      void recordTranslation({
        sessionType: "region",
        sourceText: sourceTextRef.current,
        translatedText: payload.translatedText,
        sourceLanguage: sourceLanguageRef.current,
        targetLanguage: targetLanguageRef.current,
        providerId: payload.provider,
        modelId: payload.model,
      }).catch(() => {
        // Swallowed by design: recording is best-effort, never user-facing.
      });
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

    // BUG FIX (item 2): a NEW region confirmed while this dialog is ALREADY
    // open (main screen, tray, hotkey, or the in-dialog re-select button) only
    // FOCUSES this window core-side - it never re-mounts, so the one-time
    // mount handshake below never runs again on its own. The core emits
    // `region:selected` in exactly that case; reset every piece of state back
    // to the initial "waiting for OCR" shape and re-run the handshake so the
    // dialog actually refreshes for the new region instead of silently
    // keeping the old one.
    const onRegionSelected = () => {
      clearTranslationTimeout();
      requestIdRef.current = null;
      sourceTextRef.current = "";
      sourceLanguageRef.current = "";
      translationRef.current = null;
      setConsentDisclosure(null);
      setConsentDialogOpen(false);
      setState((prev) => ({
        ...INITIAL_STATE,
        provider: prev.provider,
        model: prev.model,
      }));
      void regionIpc.previewReady();
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
      const un4 = await listenIpc<OcrErrorPayload>(
        EVENT_REGION_OCR_ERROR,
        onOcrError,
      );
      const un5 = await listenIpc<ConsentDisclosure>(
        EVENT_MODELS_CONSENT_REQUIRED,
        onConsentRequired,
      );
      const un6 = await listenIpc<void>(
        EVENT_REGION_SELECTED,
        onRegionSelected,
      );
      const un7 = await listenIpc<TranslationDeltaPayload>(
        EVENT_REGION_TRANSLATION_DELTA,
        onTranslationDelta,
      );
      if (disposed) {
        un1();
        un2();
        un3();
        un4();
        un5();
        un6();
        un7();
        return;
      }
      unlistens.push(un1, un2, un3, un4, un5, un6, un7);
      // Handshake: listeners are attached, the pipeline may emit now.
      await regionIpc.previewReady();
    })();

    return () => {
      disposed = true;
      clearTranslationTimeout();
      unlistens.forEach((un) => un());
    };
  }, [beginTranslationForSource, clearTranslationTimeout]);

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
    if (!hasKeyRef.current) {
      // Same no-key gate as the initial OCR path - never a doomed request.
      translationRef.current = null;
      setState((prev) => ({
        ...prev,
        status: "failed",
        translation: null,
        failureReason: "noKey",
      }));
      return;
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

  const grantConsent = useCallback(() => {
    const disclosure = consentDisclosure;
    if (!disclosure) {
      return;
    }
    void (async () => {
      // Fail-closed gate lives in Rust; grant, then re-arm the pipeline so OCR
      // runs (contract: re-signal region_preview_ready after granting).
      await modelIpc.grantConsent(disclosure.modelSetId);
      setConsentDialogOpen(false);
      setState((prev) => ({
        ...INITIAL_STATE,
        status: "waitingOcr",
        provider: prev.provider,
        model: prev.model,
      }));
      await regionIpc.previewReady();
    })();
  }, [consentDisclosure]);

  const declineConsent = useCallback(() => {
    // Close WITHOUT granting; OCR stays blocked (status: consentRequired).
    setConsentDialogOpen(false);
  }, []);

  const reopenConsent = useCallback(() => {
    if (consentDisclosure) {
      setConsentDialogOpen(true);
    }
  }, [consentDisclosure]);

  const openSettings = useCallback(() => {
    void settingsIpc.open();
  }, []);

  const setSourceLanguage = useCallback((language: SourceLanguage) => {
    sourceLanguagePrefRef.current = language;
    setSourceLanguageState(language);
    // Persist so the NEXT selection (here, home screen, or select overlay)
    // defaults to this pin; best-effort only.
    void loadRegionLanguageSettings()
      .then((settings) =>
        saveRegionLanguageSettings({ ...settings, sourceLanguage: language }),
      )
      .catch(() => undefined);
  }, []);

  const setTargetLanguage = useCallback((language: string) => {
    targetLanguageRef.current = language;
    setTargetLanguageState(language);
    void loadRegionLanguageSettings()
      .then((settings) =>
        saveRegionLanguageSettings({ ...settings, targetLanguage: language }),
      )
      .catch(() => undefined);
  }, []);

  const reselect = useCallback(() => {
    // Opens the SAME fullscreen select overlay as the main screen/tray/hotkey
    // (item 1); confirming it refreshes THIS dialog via `region:selected`
    // (item 2 fix) instead of requiring the user to close and reopen.
    void regionIpc.startSelection();
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
    close,
    dismiss,
    nudge,
    consentDisclosure,
    consentDialogOpen,
    grantConsent,
    declineConsent,
    reopenConsent,
    openSettings,
    sourceLanguage,
    setSourceLanguage,
    targetLanguage,
    setTargetLanguage,
    reselect,
    layout,
    setLayout,
    sourceDraft,
    setSourceDraft,
    pasteSourceText,
    commitSourceEdit,
  };
}
