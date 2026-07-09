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
export const EVENT_REGION_TRANSLATION_RESULT = "region:translation-result";
export const EVENT_REGION_TRANSLATION_ERROR = "region:translation-error";

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

  /** Confirm the selected region (mouse release / Enter, AC-02.1). */
  confirmSelection: (region: RegionRect): Promise<void> =>
    invokeIpc("confirm_region_selection", { region }),

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
