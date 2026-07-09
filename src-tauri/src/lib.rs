mod audio;
mod capture;
mod commands;
pub mod keys;
mod ocr;
pub mod providers;
mod shell;
mod stt;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init());

    // Desktop-only shell features: global hotkeys + tray (FR-04).
    #[cfg(desktop)]
    let builder = builder.plugin(shell::hotkeys::plugin());

    builder
        .manage(shell::region::RegionState::default())
        .setup(|app| {
            #[cfg(desktop)]
            shell::init(app.handle())?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            shell::region::start_region_selection,
            shell::region::cancel_region_selection,
            shell::region::confirm_region_selection,
            shell::region::region_preview_ready,
            shell::region::request_region_translation,
            shell::region::set_region_live_update,
            shell::region::close_region_preview,
            shell::region::nudge_region_preview,
        ])
        .run(tauri::generate_context!())
        // expect is acceptable here: outermost entry point, failure to start the
        // Tauri runtime is unrecoverable and must abort with a message.
        .expect("error while running tauri application");
}
