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

/** Frontend -> core translation request (initial and re-translate, AC-02.8). */
export interface RegionTranslationRequest {
  requestId: string;
  sourceText: string;
  provider: string;
  model: string;
}

export const EVENT_REGION_OCR_RESULT = "region:ocr-result";
export const EVENT_REGION_OCR_ERROR = "region:ocr-error";
export const EVENT_REGION_TRANSLATION_RESULT = "region:translation-result";
export const EVENT_REGION_TRANSLATION_ERROR = "region:translation-error";
/** Shared model-download consent gate (OCR now, whisper STT in Phase 2). */
export const EVENT_MODELS_CONSENT_REQUIRED = "models:consent-required";

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

  // TODO(TASK-007 post-TASK-009): revoke consent control in Settings.
  // The wrapper below is ready; the SettingsView surface lands with TASK-009,
  // and the revoke toggle is wired during the post-TASK-009 rebase.
  /** Revoke consent (Settings); the next download fails closed again. */
  revokeConsent: (modelSetId: string): Promise<void> =>
    invokeIpc("revoke_model_consent", { modelSetId }),
};
