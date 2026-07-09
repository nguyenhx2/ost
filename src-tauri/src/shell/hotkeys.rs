//! Global hotkeys (AC-04.1 partial): region-select trigger that works while
//! another application has focus, via tauri-plugin-global-shortcut.

use tauri::Runtime;
use tauri_plugin_global_shortcut::{Shortcut, ShortcutState};

/// PROVISIONAL default hotkey for "select region to translate".
///
/// OI-04 (default hotkey set) is an OPEN decision: this combo is a
/// placeholder so FR-04 is exercisable, NOT a settled default. It becomes
/// user-configurable (and gets its final default) with the Settings UI.
pub const DEFAULT_HOTKEY_REGION_SELECT: &str = "Ctrl+Alt+R";

/// Build the global-shortcut plugin with the provisional hotkeys registered.
pub fn plugin<R: Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri_plugin_global_shortcut::Builder::<R>::new()
        .with_shortcuts([DEFAULT_HOTKEY_REGION_SELECT])
        // expect is acceptable here: the shortcut string is a compile-time
        // constant validated by the parse test below; failure means a typo
        // that must abort startup loudly.
        .expect("default hotkey must parse")
        .with_handler(|app, shortcut, event| {
            if event.state() != ShortcutState::Pressed {
                return;
            }
            if is_region_select(shortcut) {
                // Log-and-continue: a failed window open must not kill the
                // hotkey handler thread.
                if let Err(error) = crate::shell::region::open_selection_window(app) {
                    eprintln!("failed to open region selection window: {error}");
                }
            }
        })
        .build()
}

fn is_region_select(shortcut: &Shortcut) -> bool {
    DEFAULT_HOTKEY_REGION_SELECT
        .parse::<Shortcut>()
        .map(|expected| *shortcut == expected)
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn provisional_region_select_hotkey_parses() {
        assert!(DEFAULT_HOTKEY_REGION_SELECT.parse::<Shortcut>().is_ok());
    }

    #[test]
    fn is_region_select_matches_the_parsed_constant() {
        let shortcut: Shortcut = DEFAULT_HOTKEY_REGION_SELECT.parse().unwrap();
        assert!(is_region_select(&shortcut));
    }

    #[test]
    fn is_region_select_rejects_other_shortcuts() {
        let other: Shortcut = "Ctrl+Alt+Q".parse().unwrap();
        assert!(!is_region_select(&other));
    }
}
