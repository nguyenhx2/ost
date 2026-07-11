//! Settings window lifecycle (FR-03 / FR-04, TASK-009). The Settings surface is
//! a normal decorated window (not an overlay); it loads the same bundle with
//! `?view=settings` and hosts the provider key / model management UI.

use tauri::{AppHandle, Runtime, WebviewUrl};

use super::windows::{open_deferred, Existing};

pub const SETTINGS_WINDOW_LABEL: &str = "settings";

#[derive(Debug, thiserror::Error)]
pub enum SettingsWindowError {
    #[error("window error: {0}")]
    Window(#[from] tauri::Error),
}

impl serde::Serialize for SettingsWindowError {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}

/// Open the Settings window, focusing it if it already exists (single
/// instance). The build itself is DEFERRED off the calling turn (TASK-027
/// `open_deferred`) so this never deadlocks when invoked from inside a WebView
/// IPC callback; this function always returns `Ok(())` once the open is
/// scheduled - a deferred build failure is logged, not surfaced here.
pub fn open_settings_window<R: Runtime>(app: &AppHandle<R>) -> Result<(), SettingsWindowError> {
    open_deferred(
        app,
        SETTINGS_WINDOW_LABEL,
        WebviewUrl::App("index.html?view=settings".into()),
        Existing::ShowAndFocus,
        |builder| {
            builder
                .title("OST - Settings")
                .inner_size(720.0, 640.0)
                .min_inner_size(480.0, 480.0)
                .resizable(true)
        },
        |_window| Ok(()),
    );
    Ok(())
}

/// Tauri command: open the Settings window (invoked from the WebView, e.g. an
/// "open settings" affordance or a not-configured error surface).
#[tauri::command]
pub fn open_settings(app: AppHandle) -> Result<(), SettingsWindowError> {
    open_settings_window(&app)
}
