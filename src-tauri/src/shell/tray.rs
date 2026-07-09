//! Tray icon and menu (AC-04.2 partial): "chọn vùng dịch" entry plus quit.
//! The full tray menu (audio session, Settings, History) lands with the
//! remaining FR-01/FR-04 tasks. Tray labels are Vietnamese-first; tray-menu
//! i18n follows the Settings UI-language work (AC-04.7 covers WebView strings).

use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::TrayIconBuilder,
    AppHandle,
};

pub const TRAY_ID: &str = "ost-tray";
pub const MENU_ID_REGION_SELECT: &str = "region-select";
pub const MENU_ID_QUIT: &str = "quit";

const LABEL_REGION_SELECT: &str = "Chọn vùng dịch";
const LABEL_QUIT: &str = "Thoát";

pub fn init(app: &AppHandle) -> tauri::Result<()> {
    let region_select =
        MenuItemBuilder::with_id(MENU_ID_REGION_SELECT, LABEL_REGION_SELECT).build(app)?;
    let quit = MenuItemBuilder::with_id(MENU_ID_QUIT, LABEL_QUIT).build(app)?;
    let menu = MenuBuilder::new(app)
        .items(&[&region_select, &quit])
        .build()?;

    let mut tray = TrayIconBuilder::with_id(TRAY_ID)
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| match event.id().as_ref() {
            MENU_ID_REGION_SELECT => {
                if let Err(error) = crate::shell::region::open_selection_window(app) {
                    eprintln!("failed to open region selection window: {error}");
                }
            }
            MENU_ID_QUIT => app.exit(0),
            _ => {}
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}
