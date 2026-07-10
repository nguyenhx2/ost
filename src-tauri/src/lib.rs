// Public for the audio session pipeline wiring + STT stage (TASK-014/015) and
// the audio latency benchmark harness (tests/benches). Capture stays in-memory
// only (AC-01.6).
pub mod audio;
// Public for the capture->OCR criterion benchmark (benches/); the pipeline is
// wired into the Tauri runtime via shell::region (TASK-007).
pub mod capture;
mod commands;
pub mod keys;
// Shared first-run model-download consent + download facility (TASK-007).
pub mod models;
// Public for the OCR spike + capture->OCR benchmark harness (benches/ + tests/).
pub mod ocr;
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
        .plugin(tauri_plugin_clipboard_manager::init())
        // Settings persistence (default provider/model + fallback order) and
        // first-run model-download consent flags (JSON, no secrets). NEVER stores
        // keys - keys live only in the OS keychain (security-privacy.md).
        .plugin(tauri_plugin_store::Builder::new().build());

    // Desktop-only shell features: global hotkeys + tray (FR-04).
    #[cfg(desktop)]
    let builder = builder.plugin(shell::hotkeys::plugin());

    builder
        .manage(shell::region::RegionState::default())
        // Provider key store (FR-03): the single path to the OS keychain.
        .manage(keys::KeyStore::new_os_keychain())
        .setup(|app| {
            // Build the fail-closed model-consent gate over the persisted store,
            // then wire the OCR pipeline through it (no silent auto-download,
            // security-privacy.md). Both are managed here because the persisted
            // consent store needs the AppHandle available only in setup.
            use std::sync::Arc;
            use tauri::Manager;
            use tauri_plugin_store::StoreExt;

            let store = app.store(models::CONSENT_STORE_FILE)?;
            let consent: Arc<dyn models::ConsentStore> =
                Arc::new(models::StoreConsentStore::new(store));
            let descriptor = ocr::ocr_model_set_descriptor(models::resolve_model_cache_dir());
            let gate = Arc::new(models::ModelGate::new(consent, vec![descriptor]));

            app.manage(models::ModelConsent::new(Arc::clone(&gate)));
            app.manage(shell::region::RegionPipeline::new_default(gate));

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
            shell::settings::open_settings,
            commands::keys::provider_key_statuses,
            commands::keys::save_provider_key,
            commands::keys::check_provider_key,
            commands::keys::delete_provider_key,
            models::model_consent_status,
            models::grant_model_consent,
            models::revoke_model_consent,
        ])
        .run(tauri::generate_context!())
        // expect is acceptable here: outermost entry point, failure to start the
        // Tauri runtime is unrecoverable and must abort with a message.
        .expect("error while running tauri application");
}
