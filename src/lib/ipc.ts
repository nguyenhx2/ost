import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";

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
