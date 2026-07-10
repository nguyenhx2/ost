//! Tray icon and menu (AC-04.2): the app is always reachable from the tray while
//! it runs. The menu drives every background action - start/stop the audio
//! session, region select, open Settings, open History, and quit. Closing a
//! primary window hides it to the tray (see `shell::on_window_event`); QUIT is
//! exclusively the tray "Thoát" item. Tray labels are Vietnamese-first (the tray
//! menu is a native OS surface outside the WebView i18n system, AC-04.7).

use tauri::{
    menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem},
    tray::TrayIconBuilder,
    AppHandle,
};

pub const TRAY_ID: &str = "ost-tray";
pub const MENU_ID_AUDIO_START: &str = "audio-start";
pub const MENU_ID_AUDIO_STOP: &str = "audio-stop";
pub const MENU_ID_REGION_SELECT: &str = "region-select";
pub const MENU_ID_SETTINGS: &str = "settings";
pub const MENU_ID_HISTORY: &str = "history";
pub const MENU_ID_QUIT: &str = "quit";

const LABEL_AUDIO_START: &str = "Bắt đầu dịch âm thanh";
const LABEL_AUDIO_STOP: &str = "Dừng dịch âm thanh";
const LABEL_REGION_SELECT: &str = "Chọn vùng dịch";
const LABEL_SETTINGS: &str = "Cài đặt";
const LABEL_HISTORY: &str = "Lịch sử";
const LABEL_QUIT: &str = "Thoát";

pub fn init(app: &AppHandle) -> tauri::Result<()> {
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
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| handle_menu_event(app, event.id().as_ref()));
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
    match id {
        MENU_ID_AUDIO_START => crate::shell::hotkeys::start_audio(app),
        MENU_ID_AUDIO_STOP => crate::shell::hotkeys::stop_audio(app),
        MENU_ID_REGION_SELECT => {
            if let Err(error) = crate::shell::region::open_selection_window(app) {
                eprintln!("failed to open region selection window: {error}");
            }
        }
        MENU_ID_SETTINGS => {
            if let Err(error) = crate::shell::settings::open_settings_window(app) {
                eprintln!("failed to open settings window: {error}");
            }
        }
        MENU_ID_HISTORY => {
            if let Err(error) = crate::shell::history::open_history_window(app) {
                eprintln!("failed to open history window: {error}");
            }
        }
        MENU_ID_QUIT => app.exit(0),
        _ => {}
    }
}
