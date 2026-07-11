//! Tray icon and menu (AC-04.2): the app is always reachable from the tray while
//! it runs. The menu drives every background action - restore the main window,
//! start/stop the audio session, region select, open Settings, open History, and
//! quit. Closing a primary window hides it to the tray (see
//! `shell::on_window_event`); QUIT is exclusively the tray "Thoát" item. Tray
//! labels are Vietnamese-first (the tray menu is a native OS surface outside the
//! WebView i18n system, AC-04.7).
//!
//! Left-clicking the tray icon restores the main window (TASK-029) instead of
//! opening the menu: the native right-click context menu remains reachable on
//! every platform regardless of `show_menu_on_left_click` (that flag only ever
//! controls the LEFT-click behavior), so disabling it here does not hide the
//! menu - it only frees the left click for the restore action.

use tauri::{
    menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle,
};

pub const TRAY_ID: &str = "ost-tray";
pub const MENU_ID_SHOW_WINDOW: &str = "show-window";
pub const MENU_ID_AUDIO_START: &str = "audio-start";
pub const MENU_ID_AUDIO_STOP: &str = "audio-stop";
pub const MENU_ID_REGION_SELECT: &str = "region-select";
pub const MENU_ID_SETTINGS: &str = "settings";
pub const MENU_ID_HISTORY: &str = "history";
pub const MENU_ID_QUIT: &str = "quit";

const LABEL_SHOW_WINDOW: &str = "Hiện cửa sổ chính";
const LABEL_AUDIO_START: &str = "Bắt đầu dịch âm thanh";
const LABEL_AUDIO_STOP: &str = "Dừng dịch âm thanh";
const LABEL_REGION_SELECT: &str = "Chọn vùng dịch";
const LABEL_SETTINGS: &str = "Cài đặt";
const LABEL_HISTORY: &str = "Lịch sử";
const LABEL_QUIT: &str = "Thoát";

/// Every distinct thing a tray interaction (a menu selection or an icon click)
/// can ask the shell to do. Kept separate from the `tauri` menu-id/click-event
/// plumbing so the MAPPING from an id/click to an action is a pure function -
/// testable without a running `AppHandle` (see `tests` below).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum TrayAction {
    ShowMainWindow,
    StartAudio,
    StopAudio,
    RegionSelect,
    OpenSettings,
    OpenHistory,
    Quit,
}

/// Map a tray MENU item id to the action it requests, or `None` for an
/// unrecognized id (defensive - menu ids are our own constants).
fn tray_action_for_menu_id(id: &str) -> Option<TrayAction> {
    match id {
        MENU_ID_SHOW_WINDOW => Some(TrayAction::ShowMainWindow),
        MENU_ID_AUDIO_START => Some(TrayAction::StartAudio),
        MENU_ID_AUDIO_STOP => Some(TrayAction::StopAudio),
        MENU_ID_REGION_SELECT => Some(TrayAction::RegionSelect),
        MENU_ID_SETTINGS => Some(TrayAction::OpenSettings),
        MENU_ID_HISTORY => Some(TrayAction::OpenHistory),
        MENU_ID_QUIT => Some(TrayAction::Quit),
        _ => None,
    }
}

/// Map a tray ICON click to the action it requests. Only a LEFT click on its
/// RELEASE (`MouseButtonState::Up` - despite tauri's inverted doc comment on
/// that variant, the Windows tray backend emits `Up` for `WM_LBUTTONUP`, i.e.
/// release; `Down` for `WM_LBUTTONDOWN`, i.e. press) restores the main window,
/// so the action fires once per click rather than twice (press AND release).
/// Right/middle clicks are deliberately ignored here: the native context menu
/// on right-click is OS-driven and independent of this handler.
fn tray_action_for_icon_click(button: MouseButton, state: MouseButtonState) -> Option<TrayAction> {
    if button == MouseButton::Left && state == MouseButtonState::Up {
        Some(TrayAction::ShowMainWindow)
    } else {
        None
    }
}

pub fn init(app: &AppHandle) -> tauri::Result<()> {
    let show_window =
        MenuItemBuilder::with_id(MENU_ID_SHOW_WINDOW, LABEL_SHOW_WINDOW).build(app)?;
    let audio_start =
        MenuItemBuilder::with_id(MENU_ID_AUDIO_START, LABEL_AUDIO_START).build(app)?;
    let audio_stop = MenuItemBuilder::with_id(MENU_ID_AUDIO_STOP, LABEL_AUDIO_STOP).build(app)?;
    let region_select =
        MenuItemBuilder::with_id(MENU_ID_REGION_SELECT, LABEL_REGION_SELECT).build(app)?;
    let settings = MenuItemBuilder::with_id(MENU_ID_SETTINGS, LABEL_SETTINGS).build(app)?;
    let history = MenuItemBuilder::with_id(MENU_ID_HISTORY, LABEL_HISTORY).build(app)?;
    let quit = MenuItemBuilder::with_id(MENU_ID_QUIT, LABEL_QUIT).build(app)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let menu = MenuBuilder::new(app)
        .items(&[
            &show_window,
            &separator,
            &audio_start,
            &audio_stop,
            &region_select,
            &separator,
            &settings,
            &history,
            &separator,
            &quit,
        ])
        .build()?;

    let mut tray = TrayIconBuilder::with_id(TRAY_ID)
        .menu(&menu)
        // The native right-click context menu stays reachable regardless of
        // this flag (platform behavior, not this crate's) - it only governs
        // whether a LEFT click ALSO opens the menu. Disabled so left-click is
        // free for the restore-main-window action wired below (TASK-029).
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| handle_menu_event(app, event.id().as_ref()))
        .on_tray_icon_event(|tray, event| handle_tray_icon_event(tray.app_handle(), event));
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}

/// Dispatch a tray menu selection to the owning shell action. Every branch is
/// the app's own window/session - the tray never sends or types a translation
/// anywhere (human-in-the-loop.md).
fn handle_menu_event(app: &AppHandle, id: &str) {
    if let Some(action) = tray_action_for_menu_id(id) {
        dispatch_tray_action(app, action);
    }
}

/// Dispatch a tray ICON click (left-click restores the main window; see
/// `tray_action_for_icon_click`).
fn handle_tray_icon_event(app: &AppHandle, event: TrayIconEvent) {
    if let TrayIconEvent::Click {
        button,
        button_state,
        ..
    } = event
    {
        if let Some(action) = tray_action_for_icon_click(button, button_state) {
            dispatch_tray_action(app, action);
        }
    }
}

/// Execute a resolved tray action. Restoring the main window routes through
/// the TASK-027 deferred window helper (`shell::windows::open_deferred`, via
/// `shell::main_window::restore_main_window`) - never an inline window build
/// on this call stack.
fn dispatch_tray_action(app: &AppHandle, action: TrayAction) {
    match action {
        TrayAction::ShowMainWindow => crate::shell::main_window::restore_main_window(app),
        TrayAction::StartAudio => crate::shell::hotkeys::start_audio(app),
        TrayAction::StopAudio => crate::shell::hotkeys::stop_audio(app),
        TrayAction::RegionSelect => {
            if let Err(error) = crate::shell::region::open_selection_window(app) {
                eprintln!("failed to open region selection window: {error}");
            }
        }
        TrayAction::OpenSettings => {
            if let Err(error) = crate::shell::settings::open_settings_window(app) {
                eprintln!("failed to open settings window: {error}");
            }
        }
        TrayAction::OpenHistory => {
            if let Err(error) = crate::shell::history::open_history_window(app) {
                eprintln!("failed to open history window: {error}");
            }
        }
        TrayAction::Quit => app.exit(0),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn each_menu_id_maps_to_its_expected_action() {
        assert_eq!(
            tray_action_for_menu_id(MENU_ID_SHOW_WINDOW),
            Some(TrayAction::ShowMainWindow)
        );
        assert_eq!(
            tray_action_for_menu_id(MENU_ID_AUDIO_START),
            Some(TrayAction::StartAudio)
        );
        assert_eq!(
            tray_action_for_menu_id(MENU_ID_AUDIO_STOP),
            Some(TrayAction::StopAudio)
        );
        assert_eq!(
            tray_action_for_menu_id(MENU_ID_REGION_SELECT),
            Some(TrayAction::RegionSelect)
        );
        assert_eq!(
            tray_action_for_menu_id(MENU_ID_SETTINGS),
            Some(TrayAction::OpenSettings)
        );
        assert_eq!(
            tray_action_for_menu_id(MENU_ID_HISTORY),
            Some(TrayAction::OpenHistory)
        );
        assert_eq!(
            tray_action_for_menu_id(MENU_ID_QUIT),
            Some(TrayAction::Quit)
        );
    }

    #[test]
    fn an_unknown_menu_id_maps_to_no_action() {
        assert_eq!(tray_action_for_menu_id("not-a-real-id"), None);
    }

    #[test]
    fn left_click_release_restores_the_main_window() {
        assert_eq!(
            tray_action_for_icon_click(MouseButton::Left, MouseButtonState::Up),
            Some(TrayAction::ShowMainWindow)
        );
    }

    #[test]
    fn left_click_press_fires_no_action_so_release_is_the_single_trigger() {
        assert_eq!(
            tray_action_for_icon_click(MouseButton::Left, MouseButtonState::Down),
            None
        );
    }

    #[test]
    fn right_click_never_restores_the_window_leaving_the_native_menu_reachable() {
        assert_eq!(
            tray_action_for_icon_click(MouseButton::Right, MouseButtonState::Up),
            None
        );
        assert_eq!(
            tray_action_for_icon_click(MouseButton::Right, MouseButtonState::Down),
            None
        );
    }

    #[test]
    fn middle_click_fires_no_action() {
        assert_eq!(
            tray_action_for_icon_click(MouseButton::Middle, MouseButtonState::Up),
            None
        );
    }

    #[test]
    fn tray_labels_are_non_empty_vietnamese_first_copy() {
        for label in [
            LABEL_SHOW_WINDOW,
            LABEL_AUDIO_START,
            LABEL_AUDIO_STOP,
            LABEL_REGION_SELECT,
            LABEL_SETTINGS,
            LABEL_HISTORY,
            LABEL_QUIT,
        ] {
            assert!(!label.trim().is_empty());
        }
    }
}
