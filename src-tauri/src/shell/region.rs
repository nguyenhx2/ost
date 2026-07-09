//! Region-translate UI shell (FR-02 / FR-04): selection + preview window
//! lifecycle and the IPC commands they use. The capture/OCR/provider pipeline
//! itself is TASK-007; debug builds emit MOCK pipeline events so the UI flow
//! is exercisable end to end without it.

use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, Runtime, WebviewUrl, WebviewWindowBuilder};

pub const SELECT_WINDOW_LABEL: &str = "region-select";
pub const PREVIEW_WINDOW_LABEL: &str = "region-preview";

/// Event names - keep in sync with `src/lib/ipc.ts` and
/// `docs/architecture/api-contracts/ipc.md`.
pub const EVENT_OCR_RESULT: &str = "region:ocr-result";
pub const EVENT_TRANSLATION_RESULT: &str = "region:translation-result";
/// Emitted by the provider layer when a translation request fails; the UI
/// leaves the "translating" state instead of hanging (human-in-the-loop.md).
pub const EVENT_TRANSLATION_ERROR: &str = "region:translation-error";

/// Upper bound for sane region dimensions/offsets (physical px).
const MAX_REGION_PX: u32 = 32_768;
/// Upper bound for one keyboard nudge of the preview window (px).
const MAX_NUDGE_PX: i32 = 256;

#[derive(Debug, thiserror::Error)]
pub enum ShellError {
    #[error("invalid region: {0}")]
    InvalidRegion(String),
    #[error("window error: {0}")]
    Window(#[from] tauri::Error),
    #[error("window not found: {0}")]
    WindowNotFound(&'static str),
}

// Tauri command errors must be serializable for the WebView; the display
// string never contains user content or secrets.
impl Serialize for ShellError {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}

/// Selection rectangle in PHYSICAL screen pixels relative to the primary
/// monitor origin. IPC carries pixel coords ONLY - image bytes never cross
/// the IPC boundary (security-privacy.md).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
pub struct RegionRect {
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
}

/// Frontend -> core translation request (initial and re-translate, AC-02.8).
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegionTranslationRequest {
    pub request_id: String,
    pub source_text: String,
    pub provider: String,
    pub model: String,
}

/// Payload of [`EVENT_OCR_RESULT`].
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrResultPayload {
    pub request_id: String,
    pub source_text: String,
    /// Pipeline-computed flag (AC-02.6); the threshold is OI-07, not UI-side.
    pub low_confidence: bool,
    pub detected_language: Option<String>,
}

/// Payload of [`EVENT_TRANSLATION_RESULT`].
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TranslationResultPayload {
    pub request_id: String,
    pub translated_text: String,
    pub provider: String,
    pub model: String,
}

/// Payload of [`EVENT_TRANSLATION_ERROR`]. `message` is an OPTIONAL diagnostic
/// string (never a secret or user content); the UI renders its own localized
/// error copy and treats this as untrusted DATA (agent-guardrails.md).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TranslationErrorPayload {
    pub request_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

/// Shared region-session state (managed by the Tauri builder).
#[derive(Debug, Default)]
pub struct RegionState {
    /// Region confirmed by the user, pending pipeline pickup (TASK-007).
    pub pending_region: Mutex<Option<RegionRect>>,
    /// Live-update toggle from the preview overlay (AC-02.4 UI half).
    pub live_update: Mutex<bool>,
}

pub fn validate_region(region: &RegionRect) -> Result<(), ShellError> {
    if region.width == 0 || region.height == 0 {
        return Err(ShellError::InvalidRegion(
            "width and height must be > 0".into(),
        ));
    }
    if region.width > MAX_REGION_PX
        || region.height > MAX_REGION_PX
        || region.x > MAX_REGION_PX
        || region.y > MAX_REGION_PX
    {
        return Err(ShellError::InvalidRegion("coordinates out of range".into()));
    }
    Ok(())
}

/// Clamp a keyboard nudge delta to a sane per-keypress range.
pub fn clamp_nudge(delta: i32) -> i32 {
    delta.clamp(-MAX_NUDGE_PX, MAX_NUDGE_PX)
}

/// Open the fullscreen selection overlay window (created on demand, torn
/// down on cancel/confirm - idle budget, FR-05). Focuses the existing window
/// if one is already open.
pub fn open_selection_window<R: Runtime>(app: &AppHandle<R>) -> Result<(), ShellError> {
    if let Some(existing) = app.get_webview_window(SELECT_WINDOW_LABEL) {
        existing.set_focus()?;
        return Ok(());
    }
    let window = WebviewWindowBuilder::new(
        app,
        SELECT_WINDOW_LABEL,
        WebviewUrl::App("index.html?view=region-select".into()),
    )
    .title("OST")
    .transparent(true)
    .decorations(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .resizable(false)
    .visible(false)
    .build()?;

    // Cover the primary monitor exactly (multi-monitor selection is out of
    // scope for TASK-008); fall back to maximized if no monitor is reported.
    if let Some(monitor) = window.primary_monitor()? {
        window.set_position(*monitor.position())?;
        window.set_size(*monitor.size())?;
    } else {
        window.maximize()?;
    }
    window.show()?;
    window.set_focus()?;
    Ok(())
}

fn open_preview_window(app: &AppHandle) -> Result<(), ShellError> {
    if let Some(existing) = app.get_webview_window(PREVIEW_WINDOW_LABEL) {
        existing.set_focus()?;
        return Ok(());
    }
    WebviewWindowBuilder::new(
        app,
        PREVIEW_WINDOW_LABEL,
        WebviewUrl::App("index.html?view=region-preview".into()),
    )
    .title("OST")
    .transparent(true)
    .decorations(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .inner_size(480.0, 320.0)
    .build()?;
    Ok(())
}

fn close_window(app: &AppHandle, label: &str) -> Result<(), ShellError> {
    if let Some(window) = app.get_webview_window(label) {
        window.close()?;
    }
    Ok(())
}

#[tauri::command]
pub fn start_region_selection(app: AppHandle) -> Result<(), ShellError> {
    open_selection_window(&app)
}

/// Esc path (AC-02.1): tear the selection window down; NO capture event.
#[tauri::command]
pub fn cancel_region_selection(app: AppHandle) -> Result<(), ShellError> {
    close_window(&app, SELECT_WINDOW_LABEL)
}

#[tauri::command]
pub fn confirm_region_selection(
    app: AppHandle,
    state: tauri::State<'_, RegionState>,
    region: RegionRect,
) -> Result<(), ShellError> {
    validate_region(&region)?;
    close_window(&app, SELECT_WINDOW_LABEL)?;
    if let Ok(mut pending) = state.pending_region.lock() {
        *pending = Some(region);
    }
    open_preview_window(&app)
}

/// Preview WebView mounted and listening. The pipeline (TASK-007) picks the
/// pending region up from here; debug builds emit a MOCK OCR event instead.
#[tauri::command]
pub fn region_preview_ready(
    app: AppHandle,
    state: tauri::State<'_, RegionState>,
) -> Result<(), ShellError> {
    let region = state
        .pending_region
        .lock()
        .ok()
        .and_then(|mut pending| pending.take());
    #[cfg(debug_assertions)]
    if region.is_some() {
        mock_pipeline::emit_mock_ocr(app);
    }
    #[cfg(not(debug_assertions))]
    {
        let _ = (app, region); // pipeline wiring lands with TASK-007
    }
    Ok(())
}

/// Translation request stub: the real path goes through the FR-03 provider
/// layer (TASK-006/007). Debug builds echo a MOCK translation event.
#[tauri::command]
pub fn request_region_translation(
    app: AppHandle,
    request: RegionTranslationRequest,
) -> Result<(), ShellError> {
    if request.source_text.trim().is_empty() {
        return Err(ShellError::InvalidRegion(
            "source text must not be empty".into(),
        ));
    }
    #[cfg(debug_assertions)]
    mock_pipeline::emit_mock_translation(app, request);
    #[cfg(not(debug_assertions))]
    {
        let _ = (app, request); // provider wiring lands with TASK-006/007
    }
    Ok(())
}

#[tauri::command]
pub fn set_region_live_update(
    state: tauri::State<'_, RegionState>,
    enabled: bool,
) -> Result<(), ShellError> {
    if let Ok(mut live) = state.live_update.lock() {
        *live = enabled;
    }
    Ok(())
}

#[tauri::command]
pub fn close_region_preview(app: AppHandle) -> Result<(), ShellError> {
    close_window(&app, PREVIEW_WINDOW_LABEL)
}

/// Keyboard reposition of the preview overlay (AC-04.3 keyboard-only path).
#[tauri::command]
pub fn nudge_region_preview(app: AppHandle, dx: i32, dy: i32) -> Result<(), ShellError> {
    let window = app
        .get_webview_window(PREVIEW_WINDOW_LABEL)
        .ok_or(ShellError::WindowNotFound(PREVIEW_WINDOW_LABEL))?;
    let position = window.outer_position()?;
    window.set_position(tauri::PhysicalPosition::new(
        position.x + clamp_nudge(dx),
        position.y + clamp_nudge(dy),
    ))?;
    Ok(())
}

/// MOCK pipeline (debug builds only): stands in for TASK-007 so the UI flow
/// runs end to end. Fixture text is synthetic - never real captured content.
#[cfg(debug_assertions)]
mod mock_pipeline {
    use super::*;
    use tauri::Emitter;

    const MOCK_DELAY_MS: u64 = 300;
    /// Synthetic sentinel: source text containing this makes the mock emit a
    /// translation-error event so the failed-state UI is exercisable by hand
    /// without a real provider (never matches genuine captured content).
    const MOCK_FAIL_SENTINEL: &str = "[[fail]]";

    pub fn emit_mock_ocr(app: AppHandle) {
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(MOCK_DELAY_MS));
            let payload = OcrResultPayload {
                request_id: "mock-ocr-1".into(),
                source_text: "The quick brown fox jumps over the lazy dog.".into(),
                low_confidence: false,
                detected_language: Some("en".into()),
            };
            let _ = app.emit_to(PREVIEW_WINDOW_LABEL, EVENT_OCR_RESULT, payload);
        });
    }

    pub fn emit_mock_translation(app: AppHandle, request: RegionTranslationRequest) {
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(MOCK_DELAY_MS));
            if request.source_text.contains(MOCK_FAIL_SENTINEL) {
                let payload = TranslationErrorPayload {
                    request_id: request.request_id,
                    message: Some("mock provider failure".into()),
                };
                let _ = app.emit_to(PREVIEW_WINDOW_LABEL, EVENT_TRANSLATION_ERROR, payload);
                return;
            }
            let payload = TranslationResultPayload {
                request_id: request.request_id,
                translated_text: format!("[bản dịch mô phỏng] {}", request.source_text),
                provider: request.provider,
                model: request.model,
            };
            let _ = app.emit_to(PREVIEW_WINDOW_LABEL, EVENT_TRANSLATION_RESULT, payload);
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validate_region_accepts_a_normal_rect() {
        let region = RegionRect {
            x: 10,
            y: 20,
            width: 300,
            height: 200,
        };
        assert!(validate_region(&region).is_ok());
    }

    #[test]
    fn validate_region_rejects_zero_dimensions() {
        let region = RegionRect {
            x: 0,
            y: 0,
            width: 0,
            height: 10,
        };
        assert!(matches!(
            validate_region(&region),
            Err(ShellError::InvalidRegion(_))
        ));
    }

    #[test]
    fn validate_region_rejects_out_of_range_values() {
        let region = RegionRect {
            x: 0,
            y: 0,
            width: MAX_REGION_PX + 1,
            height: 10,
        };
        assert!(validate_region(&region).is_err());
    }

    #[test]
    fn region_rect_deserializes_from_the_ipc_camel_case_payload() {
        let region: RegionRect =
            serde_json::from_str(r#"{"x":1,"y":2,"width":30,"height":40}"#).unwrap();
        assert_eq!(
            region,
            RegionRect {
                x: 1,
                y: 2,
                width: 30,
                height: 40
            }
        );
    }

    #[test]
    fn translation_request_deserializes_camel_case_fields() {
        let request: RegionTranslationRequest = serde_json::from_str(
            r#"{"requestId":"ui-1","sourceText":"hi","provider":"gemini","model":"m"}"#,
        )
        .unwrap();
        assert_eq!(request.request_id, "ui-1");
        assert_eq!(request.source_text, "hi");
    }

    #[test]
    fn payloads_serialize_to_camel_case_for_the_webview() {
        let payload = OcrResultPayload {
            request_id: "r".into(),
            source_text: "s".into(),
            low_confidence: true,
            detected_language: None,
        };
        let json = serde_json::to_string(&payload).unwrap();
        assert!(json.contains("\"requestId\""));
        assert!(json.contains("\"sourceText\""));
        assert!(json.contains("\"lowConfidence\""));
    }

    #[test]
    fn translation_error_payload_serializes_to_camel_case_and_omits_absent_message() {
        let payload = TranslationErrorPayload {
            request_id: "ui-1".into(),
            message: None,
        };
        let json = serde_json::to_string(&payload).unwrap();
        assert_eq!(json, r#"{"requestId":"ui-1"}"#);
        assert_eq!(EVENT_TRANSLATION_ERROR, "region:translation-error");
    }

    #[test]
    fn clamp_nudge_limits_the_per_keypress_delta() {
        assert_eq!(clamp_nudge(16), 16);
        assert_eq!(clamp_nudge(10_000), MAX_NUDGE_PX);
        assert_eq!(clamp_nudge(-10_000), -MAX_NUDGE_PX);
    }
}
