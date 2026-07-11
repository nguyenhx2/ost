//! Live caption overlay window lifecycle (FR-01 / FR-04, TASK-016). The caption
//! overlay is an always-on-top, borderless, click-anywhere-draggable window that
//! renders the bilingual `audio:caption` stream. It mirrors the region preview
//! window (`region.rs`): same transparent/decorationless/always-on-top surface,
//! same keyboard-nudge reposition path.
//!
//! The session request (provider/model/language NAMES only - never a key, never
//! audio, security-privacy.md) is passed to the WebView as query parameters so
//! the overlay owns the session lifecycle it was opened for (start on mount,
//! consent re-signal, stop on close). Only NAMES from our own catalog travel
//! here; they are still encoded defensively before being placed in the URL.

use tauri::{AppHandle, Manager, Runtime, WebviewUrl};

use super::audio_session::AudioSessionRequest;
use super::region::clamp_nudge;
use super::windows::{open_deferred, Existing};

/// Window label of the caption overlay (single instance).
pub const CAPTION_WINDOW_LABEL: &str = "caption-overlay";

/// Errors surfaced by the caption-window commands. Serialized as a plain string
/// (no secrets, no captured content).
#[derive(Debug, thiserror::Error)]
pub enum CaptionWindowError {
    #[error("window error: {0}")]
    Window(#[from] tauri::Error),
    #[error("caption overlay window not found")]
    NotFound,
}

impl serde::Serialize for CaptionWindowError {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}

/// Percent-encode the handful of characters that would break query parsing.
/// The values are provider/model/language NAMES from our own catalog (no user
/// free-text), but encoding keeps the URL well-formed regardless of the id.
fn encode_param(raw: &str) -> String {
    let mut out = String::with_capacity(raw.len());
    for ch in raw.chars() {
        match ch {
            '%' => out.push_str("%25"),
            '&' => out.push_str("%26"),
            '#' => out.push_str("%23"),
            '?' => out.push_str("%3F"),
            ' ' => out.push_str("%20"),
            other => out.push(other),
        }
    }
    out
}

/// Build the `index.html?view=caption&...` URL carrying the session request as
/// NAMES only. Factored out so the encoding is unit-testable without a window.
fn caption_url(request: &AudioSessionRequest) -> String {
    let source = request.source_language.clone().unwrap_or_default();
    let target = request.target_language.clone().unwrap_or_default();
    format!(
        "index.html?view=caption&provider={}&model={}&source={}&target={}",
        encode_param(&request.provider),
        encode_param(&request.model),
        encode_param(&source),
        encode_param(&target),
    )
}

/// Open (or focus) the always-on-top caption overlay window for a session.
///
/// The build itself is DEFERRED off the calling turn (TASK-027 `open_deferred`)
/// so this never deadlocks when invoked from inside a WebView IPC callback (the
/// owner-confirmed "Start audio session" hang from Settings); this function
/// therefore always returns `Ok(())` once the open is scheduled - a deferred
/// build failure is logged, not surfaced here.
pub fn open_caption_window<R: Runtime>(
    app: &AppHandle<R>,
    request: &AudioSessionRequest,
) -> Result<(), CaptionWindowError> {
    let url = WebviewUrl::App(caption_url(request).into());
    open_deferred(
        app,
        CAPTION_WINDOW_LABEL,
        url,
        Existing::FocusOnly,
        |builder| {
            builder
                .title("OST")
                .transparent(true)
                .decorations(false)
                .always_on_top(true)
                .skip_taskbar(true)
                .inner_size(560.0, 220.0)
                .min_inner_size(320.0, 140.0)
        },
        |_window| Ok(()),
    );
    Ok(())
}

/// Tauri command: open the caption overlay window for a session request.
#[tauri::command]
pub fn open_caption_overlay(
    app: AppHandle,
    request: AudioSessionRequest,
) -> Result<(), CaptionWindowError> {
    open_caption_window(&app, &request)
}

/// Close the caption overlay window if open (idempotent). Non-command helper so
/// the tray/hotkey paths can close the overlay without going through IPC; the
/// shared window-event handler emits `audio:stopped` on the resulting destroy.
pub fn close_caption_window<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window(CAPTION_WINDOW_LABEL) {
        let _ = window.close();
    }
}

/// Tauri command: close the caption overlay window. Idempotent.
#[tauri::command]
pub fn close_caption_overlay(app: AppHandle) -> Result<(), CaptionWindowError> {
    if let Some(window) = app.get_webview_window(CAPTION_WINDOW_LABEL) {
        window.close()?;
    }
    Ok(())
}

/// Tauri command: keyboard reposition of the caption overlay (AC-04.3). Reuses
/// the region overlay's per-keypress clamp so a held key cannot fling the window.
#[tauri::command]
pub fn nudge_caption_overlay(app: AppHandle, dx: i32, dy: i32) -> Result<(), CaptionWindowError> {
    let window = app
        .get_webview_window(CAPTION_WINDOW_LABEL)
        .ok_or(CaptionWindowError::NotFound)?;
    let position = window.outer_position()?;
    window.set_position(tauri::PhysicalPosition::new(
        position.x + clamp_nudge(dx),
        position.y + clamp_nudge(dy),
    ))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request(
        provider: &str,
        model: &str,
        src: Option<&str>,
        tgt: Option<&str>,
    ) -> AudioSessionRequest {
        AudioSessionRequest {
            provider: provider.to_string(),
            model: model.to_string(),
            source_language: src.map(str::to_string),
            target_language: tgt.map(str::to_string),
        }
    }

    #[test]
    fn caption_url_carries_names_only() {
        let url = caption_url(&request(
            "gemini",
            "gemini-2.5-flash",
            Some("ja"),
            Some("vi"),
        ));
        assert_eq!(
            url,
            "index.html?view=caption&provider=gemini&model=gemini-2.5-flash&source=ja&target=vi"
        );
    }

    #[test]
    fn caption_url_keeps_a_slash_model_id_and_defaults_absent_langs() {
        // OpenRouter models contain a slash (legal in a query value); absent
        // source/target serialize to empty (the core normalizes them).
        let url = caption_url(&request("openrouter", "openai/gpt-5-mini", None, None));
        assert_eq!(
            url,
            "index.html?view=caption&provider=openrouter&model=openai/gpt-5-mini&source=&target="
        );
    }

    #[test]
    fn encode_param_escapes_query_breaking_characters() {
        assert_eq!(encode_param("a&b#c?d e%f"), "a%26b%23c%3Fd%20e%25f");
    }
}
