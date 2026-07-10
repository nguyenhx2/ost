//! Translation-history window lifecycle (FR-04, BR-06; deferred from TASK-018).
//! The history surface is a normal decorated window (not an overlay); it loads
//! the same bundle with `?view=history` and lists the locally persisted,
//! text-only translation entries. Mirrors `settings.rs` window creation.

use tauri::{AppHandle, Manager, Runtime, WebviewUrl, WebviewWindowBuilder};

pub const HISTORY_WINDOW_LABEL: &str = "history";

#[derive(Debug, thiserror::Error)]
pub enum HistoryWindowError {
    #[error("window error: {0}")]
    Window(#[from] tauri::Error),
}

impl serde::Serialize for HistoryWindowError {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}

/// Open the History window, showing + focusing it if it already exists (single
/// instance). A close-to-tray hidden window is re-shown here (see
/// `shell::on_window_event`).
pub fn open_history_window<R: Runtime>(app: &AppHandle<R>) -> Result<(), HistoryWindowError> {
    if let Some(existing) = app.get_webview_window(HISTORY_WINDOW_LABEL) {
        existing.show()?;
        existing.set_focus()?;
        return Ok(());
    }
    WebviewWindowBuilder::new(
        app,
        HISTORY_WINDOW_LABEL,
        WebviewUrl::App("index.html?view=history".into()),
    )
    .title("OST - History")
    .inner_size(720.0, 640.0)
    .min_inner_size(480.0, 480.0)
    .resizable(true)
    .build()?;
    Ok(())
}

/// Tauri command: open the History window (invoked from the WebView or the tray).
#[tauri::command]
pub fn open_history(app: AppHandle) -> Result<(), HistoryWindowError> {
    open_history_window(&app)
}
