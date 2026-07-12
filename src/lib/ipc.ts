import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import type { ProviderId } from "./providers";

/**
 * Typed wrapper around the Tauri IPC bridge.
 *
 * ALL frontend -> core calls go through this module (coding-standards.md):
 * never import `invoke`/`listen` directly in components or hooks. Command
 * names, event names and payload types mirror the contract in
 * docs/architecture/api-contracts/ipc.md.
 */
export async function invokeIpc<T>(
  cmd: string,
  args?: Record<string, unknown>,
): Promise<T> {
  return invoke<T>(cmd, args);
}

/** Subscribe to a core -> WebView event; resolves to an unlisten function. */
export function listenIpc<T>(
  event: string,
  handler: (payload: T) => void,
): Promise<UnlistenFn> {
  return listen<T>(event, (e) => handler(e.payload));
}

/**
 * Copy text to the OS clipboard (AC-04.8): copy is the ONLY outbound action -
 * there is no auto-send/auto-type/auto-click anywhere.
 */
export async function copyToClipboard(text: string): Promise<void> {
  await writeText(text);
}

/* ------------------------------------------------------------------ */
/* Region translate (FR-02) contract                                   */
/* ------------------------------------------------------------------ */

/**
 * Confirmed selection rectangle in PHYSICAL screen pixels, relative to the
 * primary monitor origin. IPC carries pixel coords down only - image bytes
 * never cross the IPC boundary (security-privacy.md).
 */
export interface RegionRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * User-selected source language (BR-07: auto-detect PLUS manual pin). Carried
 * on `confirm_region_selection`. `"auto"`/empty means no pin (auto-detect is a
 * hint only, never asserts `degraded`); otherwise a lowercased ISO 639-1 code
 * (e.g. `"vi"`, `"ja"`, `"ko"`, `"en"`, `"zh"`). See ipc.md `SourceLanguage`.
 */
export type SourceLanguage = string;

/** No manual pin: auto-detect is a best-effort hint only (BR-07). */
export const SOURCE_LANGUAGE_AUTO = "auto";

/**
 * OCR recognition fidelity for the SELECTED source language (tagged union,
 * required on every `region:ocr-result`). `degraded` means the engine
 * recognizes the language but is MISSING a character class (e.g. PaddleOCR
 * PP-OCRv5 drops Vietnamese composed tone marks, U+1E00-U+1EFF) - the dropped
 * glyphs are NOT caught by `lowConfidence`, so the UI must show a standing
 * notice (AC-02.6, human-in-the-loop.md). `reason` is untrusted DATA: render
 * it as plain text, never interpret markup.
 */
export type OcrFidelity =
  { kind: "full" } | { kind: "degraded"; reason: string };

/** Emitted by the pipeline when OCR finishes for a captured region. */
export interface OcrResultPayload {
  requestId: string;
  /** Recognized text; empty/whitespace means "no text recognized" (AC-02.7). */
  sourceText: string;
  /**
   * Low-confidence flag computed by the pipeline (AC-02.6). The UI renders
   * the flag as-is; the numeric threshold is pipeline-side (OI-07 open).
   */
  lowConfidence: boolean;
  detectedLanguage?: string | null;
  /**
   * Recognition-fidelity declaration for the selected source language
   * (required by the contract). Older/mocked payloads without it are treated
   * as `{ kind: "full" }` by the consuming hook.
   */
  fidelity?: OcrFidelity;
}

/**
 * Emitted when capture or OCR fails (NOT the missing-consent case - that fires
 * `models:consent-required`). Moves the preview out of the "recognizing" state
 * so the UI never hangs silently (human-in-the-loop.md). `message` is OPTIONAL
 * untrusted DATA - the UI shows its own localized copy, never this raw text.
 */
export interface OcrErrorPayload {
  requestId?: string | null;
  message?: string | null;
}

/** Emitted by the provider layer when a translation completes. */
export interface TranslationResultPayload {
  requestId: string;
  translatedText: string;
  provider: string;
  model: string;
}

/**
 * Emitted by the provider layer when a translation request fails (provider
 * error, network failure, cancellation). Moves the preview out of the
 * "translating" state so the UI never hangs silently (human-in-the-loop.md,
 * BR-05). `message` is an OPTIONAL diagnostic string treated as untrusted
 * DATA - the UI shows its own localized error copy, never this raw text.
 */
export interface TranslationErrorPayload {
  requestId: string;
  message?: string;
}

/**
 * Emitted after every non-empty streamed chunk with the ACCUMULATED text so
 * far (not a bare per-chunk delta) - the UI renders `text` directly. The
 * FIRST delta for a request proves the stream is alive, which is what
 * actually clears the client-side timeout (owner complaint: a slow-but-live
 * translation used to trip a false red "timeout" error before the eventual
 * real result arrived). `text` is untrusted, provider-derived DATA - render
 * through `PlainText` only, exactly like the final result.
 */
export interface TranslationDeltaPayload {
  requestId: string;
  text: string;
}

/** Frontend -> core translation request (initial and re-translate, AC-02.8). */
export interface RegionTranslationRequest {
  requestId: string;
  sourceText: string;
  provider: string;
  model: string;
  /** User-selected target language (BR-07 default `vi`); omitted/blank falls
   * back to the core's default. Recorded verbatim in history. */
  targetLanguage?: string;
}

export const EVENT_REGION_OCR_RESULT = "region:ocr-result";
export const EVENT_REGION_OCR_ERROR = "region:ocr-error";
export const EVENT_REGION_TRANSLATION_RESULT = "region:translation-result";
export const EVENT_REGION_TRANSLATION_ERROR = "region:translation-error";
/** Progressive text as a streamed translation arrives (owner complaint 1). */
export const EVENT_REGION_TRANSLATION_DELTA = "region:translation-delta";
/** Shared model-download consent gate (OCR now, whisper STT in Phase 2). */
export const EVENT_MODELS_CONSENT_REQUIRED = "models:consent-required";
/**
 * Emitted to an ALREADY-OPEN preview window when a NEW region is confirmed
 * (main screen, tray, hotkey, or the in-dialog re-select button all reach this
 * the same way - `shell/region.rs::open_preview_window`). The preview must
 * reset its state and re-call `previewReady()` on receipt so it refreshes for
 * the new region instead of silently keeping the old one.
 */
export const EVENT_REGION_SELECTED = "region:selected";

/* ------------------------------------------------------------------ */
/* Model-download consent (shared fail-closed facility)                */
/* ------------------------------------------------------------------ */

/**
 * One downloadable artifact in a model set. `filename` is untrusted DATA
 * (render plain-text); `approxSizeBytes` is a number the UI formats itself.
 */
export interface ConsentArtifact {
  filename: string;
  approxSizeBytes: number;
}

/**
 * Disclosure shown BEFORE a first-run model download (fail-closed egress UX).
 * Names the download host explicitly (ModelScope / modelscope.cn), the artifact
 * sizes and the on-disk destination so the user decides with full knowledge
 * (security-privacy.md). All string fields are DATA - render plain-text.
 */
export interface ConsentDisclosure {
  modelSetId: string;
  displayName: string;
  /** e.g. "ModelScope". */
  hostName: string;
  /** e.g. "modelscope.cn" - the host is named, never hidden. */
  hostDomain: string;
  artifacts: ConsentArtifact[];
  totalApproxSizeBytes: number;
  /** On-disk cache destination (OAR_HOME, default ~/.oar). */
  destination: string;
}

/** Persisted consent flag plus the disclosure to show before asking. */
export interface ModelConsentStatus {
  modelSetId: string;
  granted: boolean;
  disclosure: ConsentDisclosure;
}

/** The OCR model set id used by the PP-OCRv5 pipeline (ipc.md). */
export const OCR_MODEL_SET_ID = "ocr-ppocrv5";

/**
 * The whisper STT model set id (FR-01). Reuses the SAME shared fail-closed
 * download-consent gate as OCR - no second consent facility (ipc.md). The
 * hardware-recommended `ggml-*.bin` artifact is disclosed through the shared
 * `ModelConsentStatus` / `ConsentDisclosure` types above.
 */
export const WHISPER_MODEL_SET_ID = "whisper-ggml";

/* ------------------------------------------------------------------ */
/* Live audio-translation session (FR-01) contract                     */
/* ------------------------------------------------------------------ */

/**
 * Frontend -> core request to start a live audio-translation session. Carries
 * NAMES only (provider/model ids, language codes) - never a key (BR-02) and
 * never audio. Mirrors the Rust `AudioSessionRequest` (ipc.md).
 */
export interface AudioSessionRequest {
  provider: string;
  model: string;
  /** Pinned source language (AC-01.4); `"auto"`/empty/absent = auto-detect. */
  sourceLanguage?: string;
  /** Target language (AC-01.5); empty/absent = default `vi`. */
  targetLanguage?: string;
}

/**
 * Typed `kind` surfaced when `start_audio_session` rejects (ipc.md). The UI
 * maps the kind to an i18n message; `noProviderKey` carries a Settings CTA. The
 * kind never carries key material or captured content.
 */
export type AudioErrorKind =
  | "unknownProvider"
  | "noProviderKey"
  | "keychain"
  | "consentRequired"
  | "model"
  | "capture"
  | "alreadyRunning";

export interface AudioCommandError {
  kind: AudioErrorKind;
}

/** Narrow an unknown thrown value to a typed audio-session command error. */
export function asAudioCommandError(err: unknown): AudioCommandError {
  if (
    typeof err === "object" &&
    err !== null &&
    "kind" in err &&
    typeof (err as { kind: unknown }).kind === "string"
  ) {
    return { kind: (err as { kind: AudioErrorKind }).kind };
  }
  return { kind: "capture" };
}

/**
 * The `audio:caption` event payload (ipc.md). Carries source + translated text,
 * the language pair, the provider/model that produced it (transparency,
 * AC-03.5), per-segment confidence + a low-confidence flag (AC-01.7). All text
 * is untrusted plain-text DATA (rendered via PlainText, never markup).
 */
export interface AudioCaptionPayload {
  /** Monotonic per-session chunk index. */
  sequence: number;
  sourceText: string;
  translatedText: string;
  /** Detected or pinned source-language code (AC-01.3 / AC-01.4). */
  sourceLanguage: string;
  /** `true` when whisper auto-detected; `false` when the user pinned it. */
  sourceLanguageAutoDetected: boolean;
  targetLanguage: string;
  /** Provider that actually translated (AC-03.5 badge transparency). */
  provider: string;
  model: string;
  /** Mean per-token confidence of each transcript segment, in order. */
  segmentConfidences: number[];
  /** `true` when any segment fell below threshold (AC-01.7 / BR-05). */
  lowConfidence: boolean;
  /** Milliseconds since the session started (monotonic; never wall-clock). */
  timestampMs: number;
}

/**
 * The `audio:error` event payload (ipc.md). `message` is untrusted DATA (no
 * audio/key content); the UI renders its own localized copy, never this string.
 * Emitted per failed chunk while the session keeps running (no silent hang,
 * human-in-the-loop.md).
 */
export interface AudioErrorPayload {
  message: string;
}

/** Emitted once per translated speech chunk; the caption overlay renders it. */
export const EVENT_AUDIO_CAPTION = "audio:caption";
/** Emitted when a chunk fails to transcribe/translate (non-fatal). */
export const EVENT_AUDIO_ERROR = "audio:error";
/**
 * Emitted (app-global, no payload) when the caption overlay window is destroyed
 * - directly closed or via the tray/hotkey. A separate Settings window that
 * launched the session listens for this to reset its running-state (TASK-016
 * follow-up). Owned by `src-tauri/src/shell/audio_session.rs`.
 */
export const EVENT_AUDIO_STOPPED = "audio:stopped";

/* ------------------------------------------------------------------ */
/* Provider key management (FR-03) contract                            */
/* ------------------------------------------------------------------ */

/**
 * Masked key status - the ONLY key-related data the WebView may receive
 * (AC-03.3, security-privacy.md). Field names mirror the Rust `ProviderKeyStatus`
 * serialization (snake_case, `src-tauri/src/keys/store.rs`). NEVER carries a key
 * value.
 */
export interface ProviderKeyStatus {
  provider_id: ProviderId;
  key_present: boolean;
}

/**
 * Result of saving a key (AC-03.4). `reason` on `invalid` is the redacted,
 * key-free provider reason - the UI renders its own localized copy and treats
 * this as untrusted DATA.
 */
export type SaveKeyOutcome =
  | { status: "valid" }
  | { status: "stored" }
  | { status: "invalid"; reason: string };

/** Outcome of a user-triggered key check on the stored key (AC-03.4). */
export type KeyValidation =
  { status: "valid" } | { status: "invalid"; reason: string };

/**
 * Typed command error class (`kind`) surfaced when a key command rejects. The
 * UI maps the kind to an i18n message; the kind never carries key material.
 */
export type KeyErrorKind =
  | "unknownProvider"
  | "invalidInput"
  | "notConfigured"
  | "network"
  | "quota"
  | "timeout"
  | "config"
  | "keychain"
  | "provider";

export interface KeyCommandError {
  kind: KeyErrorKind;
}

/** Narrow an unknown thrown value to a typed key command error. */
export function asKeyCommandError(err: unknown): KeyCommandError {
  if (
    typeof err === "object" &&
    err !== null &&
    "kind" in err &&
    typeof (err as { kind: unknown }).kind === "string"
  ) {
    return { kind: (err as { kind: KeyErrorKind }).kind };
  }
  // Any non-typed failure (e.g. the IPC bridge itself) is treated as unknown.
  return { kind: "provider" };
}

/** Typed key-management commands owned by `src-tauri/src/commands/keys.rs`. */
export const keysIpc = {
  /** Masked status for all four providers (AC-03.1, AC-03.3). */
  statuses: (): Promise<ProviderKeyStatus[]> =>
    invokeIpc("provider_key_statuses"),

  /** Validate then store a key; the value is sent down once, never returned. */
  saveKey: (provider: ProviderId, key: string): Promise<SaveKeyOutcome> =>
    invokeIpc("save_provider_key", { provider, key }),

  /** Re-check the stored key with one minimal provider call (AC-03.4). */
  checkKey: (provider: ProviderId): Promise<KeyValidation> =>
    invokeIpc("check_provider_key", { provider }),

  /** Remove the stored key (AC-03.7). Idempotent. */
  deleteKey: (provider: ProviderId): Promise<void> =>
    invokeIpc("delete_provider_key", { provider }),
};

/** Open the Settings window (owned by `src-tauri/src/shell/settings.rs`). */
export const settingsIpc = {
  open: (): Promise<void> => invokeIpc("open_settings"),
};

/** Open the History window (owned by `src-tauri/src/shell/history.rs`). */
export const historyIpc = {
  open: (): Promise<void> => invokeIpc("open_history"),
};

/* ------------------------------------------------------------------ */
/* Global hotkeys (FR-04, AC-04.1) contract                            */
/* ------------------------------------------------------------------ */

/**
 * The reconfigurable global-hotkey actions. Each maps to exactly one binding.
 * Mirrors the Rust `HotkeyAction` (`src-tauri/src/shell/hotkeys.rs`).
 */
export type HotkeyAction = "toggleAudio" | "regionSelect" | "toggleOverlay";

/** The ordered set of hotkey actions (drives the Settings binding rows). */
export const HOTKEY_ACTIONS: readonly HotkeyAction[] = [
  "toggleAudio",
  "regionSelect",
  "toggleOverlay",
];

/**
 * Accelerator strings (e.g. `"Ctrl+Alt+R"`) bound to each action. NAMES only -
 * persisted via tauri-plugin-store (`settings.json`, key `hotkeys`), never a
 * secret. Mirrors the Rust `HotkeyConfig` (camelCase).
 */
export interface HotkeyConfig {
  toggleAudio: string;
  regionSelect: string;
  toggleOverlay: string;
}

/**
 * Typed `kind` surfaced when `set_hotkey_config` rejects. `action` names which
 * binding is at fault (absent for a store failure). The UI maps the kind to an
 * i18n message; nothing here carries key material or captured content.
 */
export type HotkeyErrorKind =
  "invalidBinding" | "duplicate" | "conflict" | "store";

export interface HotkeyCommandError {
  kind: HotkeyErrorKind;
  action: HotkeyAction | null;
}

/** Narrow an unknown thrown value to a typed hotkey command error. */
export function asHotkeyCommandError(err: unknown): HotkeyCommandError {
  if (
    typeof err === "object" &&
    err !== null &&
    "kind" in err &&
    typeof (err as { kind: unknown }).kind === "string"
  ) {
    const e = err as { kind: HotkeyErrorKind; action?: unknown };
    const action =
      typeof e.action === "string" ? (e.action as HotkeyAction) : null;
    return { kind: e.kind, action };
  }
  return { kind: "store", action: null };
}

/**
 * Global-hotkey commands (owned by `src-tauri/src/shell/hotkeys.rs`). Rust owns
 * registration + persistence; the UI reads the effective config and submits a
 * new one. A rejected `set` leaves the previous bindings registered and returns
 * a typed error naming the unavailable action.
 */
export const hotkeysIpc = {
  /** The current effective hotkey config. */
  get: (): Promise<HotkeyConfig> => invokeIpc("get_hotkey_config"),

  /** Validate, re-register, persist, and return the new config (or reject). */
  set: (config: HotkeyConfig): Promise<HotkeyConfig> =>
    invokeIpc("set_hotkey_config", { config }),
};

/** Typed commands owned by `src-tauri/src/shell/region.rs`. */
export const regionIpc = {
  /** Open the fullscreen selection overlay window (AC-02.1). */
  startSelection: (): Promise<void> => invokeIpc("start_region_selection"),

  /** Close the selection window without capturing anything (Esc, AC-02.1). */
  cancelSelection: (): Promise<void> => invokeIpc("cancel_region_selection"),

  /**
   * Confirm the selected region (mouse release / Enter, AC-02.1). The optional
   * `sourceLanguage` (BR-07 manual pin) drives fidelity + rec-model routing
   * core-side; omitted means auto-detect (best-effort hint only).
   */
  confirmSelection: (
    region: RegionRect,
    sourceLanguage?: SourceLanguage,
  ): Promise<void> =>
    invokeIpc(
      "confirm_region_selection",
      sourceLanguage === undefined ? { region } : { region, sourceLanguage },
    ),

  /** Preview window mounted and listening; pipeline may start emitting. */
  previewReady: (): Promise<void> => invokeIpc("region_preview_ready"),

  /** Request (re-)translation of the current OCR text (AC-02.8). */
  requestTranslation: (request: RegionTranslationRequest): Promise<void> =>
    invokeIpc("request_region_translation", { request }),

  /** Toggle live update of the captured region (AC-02.4 UI half). */
  setLiveUpdate: (enabled: boolean): Promise<void> =>
    invokeIpc("set_region_live_update", { enabled }),

  /** Close the preview overlay window. */
  closePreview: (): Promise<void> => invokeIpc("close_region_preview"),

  /** Keyboard reposition of the preview window (AC-04.3, keyboard-only path). */
  nudgePreview: (dx: number, dy: number): Promise<void> =>
    invokeIpc("nudge_region_preview", { dx, dy }),
};

/**
 * Shared model-download consent commands (owned by `src-tauri/src/models/`).
 * The Rust gate is fail-closed: downloads stay blocked until `grantModelConsent`
 * succeeds, so this UI provides only the disclosure and the grant/revoke calls.
 */
export const modelIpc = {
  /** Current consent flag + disclosure for a model set (UI shows before asking). */
  consentStatus: (modelSetId: string): Promise<ModelConsentStatus> =>
    invokeIpc("model_consent_status", { modelSetId }),

  /** Grant download consent, opening the fail-closed gate. Idempotent. */
  grantConsent: (modelSetId: string): Promise<void> =>
    invokeIpc("grant_model_consent", { modelSetId }),

  /** Revoke consent (Settings, TASK-012); the next download fails closed again. */
  revokeConsent: (modelSetId: string): Promise<void> =>
    invokeIpc("revoke_model_consent", { modelSetId }),
};

/* ------------------------------------------------------------------ */
/* STT engine picker (FR-01, TASK-026 part C)                          */
/* ------------------------------------------------------------------ */

/**
 * One row of `list_stt_models` (ipc.md): a local whisper tier evaluated
 * against the CURRENT hardware probe. Cloud STT entries (Google/Azure/
 * OpenAI) are NOT part of this list - they are static, always-disabled rows
 * the UI renders itself (ADR-005 pending owner sign-off).
 */
export interface SttModelInfo {
  id: string;
  /** English fallback label from the core; the Settings UI prefers its own
   * i18n mapping by `id` and falls back to this string for unknown ids. */
  label: string;
  approxDownloadBytes: number;
  approxRamBytes: number;
  /** Already present on disk - selecting it switches with no download. */
  downloaded: boolean;
  /** `false` = hidden/disabled with a reason (RAM floor or missing CUDA). */
  allowedByProbe: boolean;
  /** `true` only for `large-v3` (FR-01.STT-2): show a "requires CUDA GPU" note. */
  requiresCuda: boolean;
  /** `true` for the model the pipeline currently uses for new sessions. */
  current: boolean;
}

/** Tagged union outcome of `request_stt_model_switch` (ipc.md). */
export type SttModelSwitchOutcome =
  | { status: "alreadyCurrent" }
  | { status: "switched" }
  | { status: "consentRequired"; disclosure: ConsentDisclosure };

export type SttModelSwitchErrorKind =
  | "unknownModel"
  | "notAllowed"
  | "sessionActive"
  | "download"
  | "store"
  | "cancelled";

export interface SttModelSwitchCommandError {
  kind: SttModelSwitchErrorKind;
}

/** Tagged error kind of `delete_stt_model` (Settings model-management list, TASK-034). */
export type SttModelDeleteErrorKind = "unknownModel" | "sessionActive" | "io";

export interface SttModelDeleteCommandError {
  kind: SttModelDeleteErrorKind;
}

/** Narrow an unknown thrown value to a typed STT-delete command error. */
export function asSttModelDeleteCommandError(
  err: unknown,
): SttModelDeleteCommandError {
  if (
    typeof err === "object" &&
    err !== null &&
    "kind" in err &&
    typeof (err as { kind: unknown }).kind === "string"
  ) {
    return { kind: (err as { kind: SttModelDeleteErrorKind }).kind };
  }
  return { kind: "io" };
}

/** Narrow an unknown thrown value to a typed STT-switch command error. */
export function asSttModelSwitchCommandError(
  err: unknown,
): SttModelSwitchCommandError {
  if (
    typeof err === "object" &&
    err !== null &&
    "kind" in err &&
    typeof (err as { kind: unknown }).kind === "string"
  ) {
    return { kind: (err as { kind: SttModelSwitchErrorKind }).kind };
  }
  return { kind: "download" };
}

/** Emitted repeatedly while `confirm_stt_model_switch` downloads (ipc.md). */
export interface SttModelDownloadProgressPayload {
  modelId: string;
  downloadedBytes: number;
  totalBytes: number;
}

export const EVENT_STT_MODEL_DOWNLOAD_PROGRESS = "stt:model-download-progress";

/** Typed STT model-picker commands (owned by `src-tauri/src/shell/audio_session.rs`). */
export const sttIpc = {
  /** Every catalog tier evaluated against the current hardware probe. */
  listModels: (): Promise<SttModelInfo[]> => invokeIpc("list_stt_models"),

  /**
   * Request a switch. Applies immediately (`switched`/`alreadyCurrent`) when
   * no download is needed; `consentRequired` names the exact download size
   * for the caller to confirm via `confirmSwitch` - never downloads on its
   * own (human-in-the-loop.md).
   */
  requestSwitch: (modelId: string): Promise<SttModelSwitchOutcome> =>
    invokeIpc("request_stt_model_switch", { modelId }),

  /** Confirm a `consentRequired` switch: downloads (progress events), then applies. */
  confirmSwitch: (modelId: string): Promise<void> =>
    invokeIpc("confirm_stt_model_switch", { modelId }),

  /**
   * Cancels `modelId`'s in-flight download (TASK-034), if any - a no-op
   * otherwise. The pending `confirmSwitch` call resolves with a `cancelled`
   * error; the caller resets its downloading state for that model id.
   */
  cancelDownload: (modelId: string): Promise<void> =>
    invokeIpc("cancel_stt_model_download", { modelId }),

  /**
   * Deletes a downloaded model's file from disk (Settings model-management
   * list, TASK-034). Consent stays granted, so a later re-select
   * re-downloads with no re-prompt. Refused while an audio session is active.
   */
  deleteModel: (modelId: string): Promise<void> =>
    invokeIpc("delete_stt_model", { modelId }),
};

/* ------------------------------------------------------------------ */
/* Translation provider picker metadata incl. local (FR-03, TASK-026)   */
/* ------------------------------------------------------------------ */

/**
 * Static per-provider picker metadata (providers.md). Mirrors the Rust
 * `ProviderMetadata` serialization VERBATIM - snake_case field names, no
 * `rename_all` - the one place the WebView learns which provider needs a
 * `base_url` field instead of an API key.
 */
export interface ProviderPickerMetadata {
  provider_id: string;
  display_name: string;
  requires_base_url: boolean;
}

export type LocalProviderErrorKind =
  | "invalidBaseUrl"
  | "localServerUnreachable"
  | "network"
  | "timeout"
  | "provider";

export interface LocalProviderCommandError {
  kind: LocalProviderErrorKind;
}

/** Narrow an unknown thrown value to a typed local-provider command error. */
export function asLocalProviderCommandError(
  err: unknown,
): LocalProviderCommandError {
  if (
    typeof err === "object" &&
    err !== null &&
    "kind" in err &&
    typeof (err as { kind: unknown }).kind === "string"
  ) {
    return { kind: (err as { kind: LocalProviderErrorKind }).kind };
  }
  return { kind: "provider" };
}

/** Typed commands owned by `src-tauri/src/commands/providers.rs`. */
export const providersIpc = {
  /** Picker metadata for every translation provider (incl. `local_openai`). */
  pickerMetadata: (): Promise<ProviderPickerMetadata[]> =>
    invokeIpc("provider_picker_metadata"),

  /**
   * Validate a candidate `base_url` (loopback-only) and probe connectivity
   * BEFORE the frontend persists it. Distinguishes `localServerUnreachable`
   * ("server not running") from a plain `network`/`invalidBaseUrl` failure.
   */
  checkLocalConnection: (baseUrl: string): Promise<void> =>
    invokeIpc("check_local_provider_connection", { baseUrl }),
};

/**
 * Live audio-translation session commands (owned by
 * `src-tauri/src/shell/audio_session.rs`). Audio never crosses IPC - only the
 * NAMES in the request go down and captions come back over `audio:caption`.
 */
export const audioIpc = {
  /** Start a session (AC-01.1). Rejects with a typed `AudioCommandError`. */
  start: (request: AudioSessionRequest): Promise<void> =>
    invokeIpc("start_audio_session", { request }),

  /** Stop the active session (AC-01.10). Idempotent. */
  stop: (): Promise<void> => invokeIpc("stop_audio_session"),
};

/**
 * Caption-overlay window commands (owned by `src-tauri/src/shell/caption.rs`).
 * The overlay is a separate always-on-top window; the session request is passed
 * as query NAMES only (no key, no audio). Mirrors the region overlay window.
 */
export const captionIpc = {
  /** Open the caption overlay window for a session request. */
  openOverlay: (request: AudioSessionRequest): Promise<void> =>
    invokeIpc("open_caption_overlay", { request }),

  /** Close the caption overlay window. */
  closeOverlay: (): Promise<void> => invokeIpc("close_caption_overlay"),

  /** Keyboard reposition of the caption overlay (AC-04.3 keyboard-only path). */
  nudgeOverlay: (dx: number, dy: number): Promise<void> =>
    invokeIpc("nudge_caption_overlay", { dx, dy }),
};

/* ------------------------------------------------------------------ */
/* Managed local-LLM translation engine (ADR-006, `src-tauri/src/llm/`) */
/* ------------------------------------------------------------------ */

/**
 * One row of `list_llm_models` (providers.md): a shipped GGUF preset
 * (Hunyuan-MT-7B default, Qwen3-14B) plus its download/running state. Mirrors
 * the Rust `LlmModelInfo` serialization (camelCase).
 */
export interface LlmModelInfo {
  id: string;
  label: string;
  approxDownloadBytes: number;
  approxRamBytes: number;
  /** Already present on disk. */
  downloaded: boolean;
  /** The first-run default preset. */
  isDefault: boolean;
  /** The managed server is currently running this model. */
  running: boolean;
}

/** Tagged union outcome of `request_llm_model_download` (providers.md). */
export type LlmModelDownloadOutcome =
  | { status: "alreadyDownloaded" }
  | { status: "consentRequired"; disclosure: ConsentDisclosure };

/** Tagged error kind shared by download/cancel/delete (providers.md). */
export type LlmModelErrorKind =
  "unknownModel" | "download" | "cancelled" | "sessionActive" | "io";

export interface LlmModelCommandError {
  kind: LlmModelErrorKind;
}

/** Narrow an unknown thrown value to a typed local-LLM model command error. */
export function asLlmModelCommandError(err: unknown): LlmModelCommandError {
  if (
    typeof err === "object" &&
    err !== null &&
    "kind" in err &&
    typeof (err as { kind: unknown }).kind === "string"
  ) {
    return { kind: (err as { kind: LlmModelErrorKind }).kind };
  }
  return { kind: "download" };
}

/** Emitted repeatedly while `confirm_llm_model_download` downloads (providers.md). */
export interface LlmModelDownloadProgressPayload {
  modelId: string;
  downloadedBytes: number;
  totalBytes: number;
}

export const EVENT_LLM_MODEL_DOWNLOAD_PROGRESS = "llm:model-download-progress";

/** Typed error kind of the managed-server control commands (providers.md). */
export type LlmServerErrorKind =
  | "unknownModel"
  | "notDownloaded"
  | "binaryNotFound"
  | "spawnFailed"
  | "exitedDuringStartup"
  | "readinessTimeout"
  | "stopFailed";

export interface LlmServerCommandError {
  kind: LlmServerErrorKind;
}

/** Narrow an unknown thrown value to a typed local-LLM server command error. */
export function asLlmServerCommandError(err: unknown): LlmServerCommandError {
  if (
    typeof err === "object" &&
    err !== null &&
    "kind" in err &&
    typeof (err as { kind: unknown }).kind === "string"
  ) {
    return { kind: (err as { kind: LlmServerErrorKind }).kind };
  }
  return { kind: "spawnFailed" };
}

/**
 * The managed server's status (providers.md). `baseUrl` is the loopback
 * address the frontend points the `local_openai` provider at once the server
 * is up - never a secret, never a non-loopback host.
 */
export interface LlmServerStatusView {
  running: boolean;
  modelId: string | null;
  baseUrl: string | null;
  port: number | null;
}

/**
 * Typed commands owned by `src-tauri/src/llm/mod.rs` (ADR-006). Model
 * management mirrors the STT download-consent flow above; server control
 * starts/stops the managed `llama-server` subprocess. Translation itself never
 * flows through this module - once `start` resolves, the caller points the
 * `local_openai` provider at the returned `baseUrl`.
 */
export const llmIpc = {
  /** Every shipped preset with download/running state (Settings picker). */
  listModels: (): Promise<LlmModelInfo[]> => invokeIpc("list_llm_models"),

  /** Read-only: never triggers a fetch. */
  requestDownload: (modelId: string): Promise<LlmModelDownloadOutcome> =>
    invokeIpc("request_llm_model_download", { modelId }),

  /** Grants consent (idempotent) and downloads, emitting progress events. */
  confirmDownload: (modelId: string): Promise<void> =>
    invokeIpc("confirm_llm_model_download", { modelId }),

  /** Cancels `modelId`'s in-flight download, if any (no-op otherwise). */
  cancelDownload: (modelId: string): Promise<void> =>
    invokeIpc("cancel_llm_model_download", { modelId }),

  /** Deletes a downloaded GGUF from disk. Refused while it is running. */
  deleteModel: (modelId: string): Promise<void> =>
    invokeIpc("delete_llm_model", { modelId }),

  /** Starts (or restarts) the managed server for `modelId`. */
  startServer: (modelId: string): Promise<LlmServerStatusView> =>
    invokeIpc("start_llm_server", { modelId }),

  /** Stops the managed server (idempotent). */
  stopServer: (): Promise<void> => invokeIpc("stop_llm_server"),

  /** The managed server's current status. */
  serverStatus: (): Promise<LlmServerStatusView> =>
    invokeIpc("llm_server_status"),
};
