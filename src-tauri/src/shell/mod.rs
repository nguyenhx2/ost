//! App shell glue for the UI: window management, tray menu, global hotkeys (FR-04).

pub mod hotkeys;
pub mod region;
pub mod tray;

use tauri::AppHandle;

/// One-time shell setup, called from the Tauri `setup` hook in `lib.rs`.
pub fn init(app: &AppHandle) -> tauri::Result<()> {
    tray::init(app)?;
    Ok(())
}
