//! Main window restore (FR-04, TASK-029). The primary window is declared
//! statically in `tauri.conf.json` (label `"main"`, the Tauri default when a
//! window config omits `label`) and is a close-to-tray surface
//! (`shell::CLOSE_TO_TRAY_LABELS`): closing it hides rather than destroys it
//! (`shell::on_window_event`), so it exists for the entire app lifetime once
//! `setup` has run. Restoring it is therefore always the "already exists"
//! branch of `windows::open_deferred` in practice; the `configure` closure
//! below only matters for the theoretical case where the main window does not
//! exist yet (e.g. a future change that allows destroying it), and mirrors
//! the window's declarative config in `tauri.conf.json` so that path is not a
//! silent no-op.

use tauri::{AppHandle, Runtime, WebviewUrl};

use super::windows::{open_deferred, Existing};

pub const MAIN_WINDOW_LABEL: &str = "main";

/// Show and focus the main window (tray menu item + tray icon left-click).
/// Routed through `windows::open_deferred` (TASK-027) so this never builds a
/// window inline on the calling turn and never deadlocks when invoked from a
/// tray callback. This only ever shows/focuses the app's OWN window - never
/// an automatic outbound action (human-in-the-loop.md).
pub fn restore_main_window<R: Runtime>(app: &AppHandle<R>) {
    open_deferred(
        app,
        MAIN_WINDOW_LABEL,
        WebviewUrl::App("index.html".into()),
        Existing::ShowAndFocus,
        |builder| builder.title("OST").inner_size(800.0, 600.0),
        |_window| Ok(()),
    );
}
