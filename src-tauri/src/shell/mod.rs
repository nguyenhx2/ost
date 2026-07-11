//! App shell glue for the UI: window management, tray menu, global hotkeys (FR-04).

pub mod audio_session;
pub mod caption;
pub mod history;
pub mod hotkeys;
pub mod region;
pub mod settings;
pub mod tray;
pub mod windows;

use tauri::{AppHandle, Emitter, Manager, Window, WindowEvent};

/// One-time shell setup, called from the Tauri `setup` hook in `lib.rs`.
pub fn init(app: &AppHandle) -> tauri::Result<()> {
    tray::init(app)?;
    hotkeys::init(app)?;
    Ok(())
}

/// Windows treated as close-to-tray (AC-04.2): closing them hides the window and
/// keeps the app running in the tray. Quit is EXCLUSIVELY the tray "Thoát" item
/// (`app.exit`). Overlay windows (caption / region) are deliberately NOT here -
/// closing an overlay genuinely tears it down (it ends its session/selection).
const CLOSE_TO_TRAY_LABELS: [&str; 3] = [
    "main",
    settings::SETTINGS_WINDOW_LABEL,
    history::HISTORY_WINDOW_LABEL,
];

/// Central window-event handler (registered once in `lib.rs`). Three jobs:
/// 1. Close-to-tray for the primary surfaces (hide instead of destroy) so the
///    app never exits on a window close - only the tray "Thoát" quits (AC-04.2).
/// 2. When the caption overlay is destroyed, stop the audio session and emit
///    `audio:stopped` so a separate Settings window keeps its running-state in
///    sync (TASK-016 follow-up).
/// 3. When the region-SELECT overlay is destroyed AND a region is pending (a
///    confirm armed one), open the region-PREVIEW window. This deferral is the
///    fix for the reentrant window-lifecycle deadlock (TASK-023): opening the
///    preview here - at the top of a fresh event-loop iteration, after
///    `NtUserDestroyWindow` has fully returned and the select window's
///    `WebviewWrapper` is dropped - means the preview WebView2 create's message
///    pump has no pending destroy to reenter. A cancel arms nothing, so its
///    `Destroyed` opens no preview.
pub fn on_window_event(window: &Window, event: &WindowEvent) {
    match event {
        WindowEvent::CloseRequested { api, .. } => {
            if CLOSE_TO_TRAY_LABELS.contains(&window.label()) {
                api.prevent_close();
                let _ = window.hide();
            }
        }
        WindowEvent::Destroyed if window.label() == caption::CAPTION_WINDOW_LABEL => {
            let app = window.app_handle();
            if let Some(pipeline) = app.try_state::<audio_session::AudioSessionPipeline>() {
                pipeline.stop();
            }
            let _ = app.emit(audio_session::EVENT_AUDIO_STOPPED, ());
        }
        WindowEvent::Destroyed if window.label() == region::SELECT_WINDOW_LABEL => {
            let app = window.app_handle();
            let open_preview = app
                .try_state::<region::RegionState>()
                .map(|state| region::should_open_preview_after_select_close(&state))
                .unwrap_or(false);
            if open_preview {
                let _ = region::open_preview_window(app);
            }
        }
        _ => {}
    }
}
