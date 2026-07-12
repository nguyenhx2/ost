// Public for the audio session pipeline wiring + STT stage (TASK-014/015) and
// the audio latency benchmark harness (tests/benches). Capture stays in-memory
// only (AC-01.6).
pub mod audio;
// Public for the capture->OCR criterion benchmark (benches/); the pipeline is
// wired into the Tauri runtime via shell::region (TASK-007).
pub mod capture;
mod commands;
// Cross-cutting coordination + measurement (FR-05): the one-heavy-session-at-a-
// time discipline and the process RAM/CPU idle-budget probe. Public for the
// idle-budget probe example/harness.
pub mod core;
pub mod keys;
// Managed local-LLM translation engine (ADR-006): consent-gated GGUF download +
// a llama-server subprocess (loopback, one-at-a-time). Public for the process-
// manager unit tests and the IPC command wiring below.
pub mod llm;
// Shared first-run model-download consent + download facility (TASK-007).
pub mod models;
// Public for the OCR spike + capture->OCR benchmark harness (benches/ + tests/).
pub mod ocr;
pub mod providers;
mod shell;
// Public for the audio session pipeline wiring (TASK-015) + STT benchmark
// harness; the whisper model stays in RAM and audio never leaves the machine.
pub mod stt;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

/// Installs the stderr `tracing` subscriber, driven by `RUST_LOG` (default
/// `warn` when unset/invalid). Without this, `RUST_LOG` produced NO output at
/// all - provider-layer failures already logged via `tracing::warn!`
/// (status + body) never reached stderr, which is exactly what hid the local
/// OpenAI-compatible provider's real failure behind the generic UI message
/// during triage. Never logs secrets: the provider layer redacts keys before
/// logging (`providers/redact.rs`) and `keys::ApiKey` has no `Display`/
/// `Serialize` impl, so one could not be printed even by accident.
fn init_tracing() {
    use tracing_subscriber::EnvFilter;
    let filter = EnvFilter::try_from_env("RUST_LOG").unwrap_or_else(|_| EnvFilter::new("warn"));
    // `try_init` (not `init`): never panics if a subscriber is already set
    // (e.g. a test harness installed one first).
    let _ = tracing_subscriber::fmt()
        .with_env_filter(filter)
        .with_writer(std::io::stderr)
        .try_init();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    init_tracing();
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

    // Desktop-only signed auto-update (FR-05, TASK-020). Update artifacts are
    // signature-verified against updater.pubkey in tauri.conf.json before install;
    // the private signing key lives ONLY in CI secrets (never in the repo). This
    // wires the plugin - checking/applying an update stays a user-initiated action.
    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_updater::Builder::new().build());

    builder
        // Close-to-tray + audio:stopped sync for the caption overlay (FR-04).
        .on_window_event(shell::on_window_event)
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
            let ocr_descriptor = ocr::ocr_model_set_descriptor(models::resolve_model_cache_dir());
            // Whisper STT (FR-01): probe the machine and disclose the RECOMMENDED
            // model (BR-08 / AC-01.8) in the same fail-closed gate - one facility,
            // no second consent gate. The download only starts after the user
            // grants consent over IPC (security-privacy.md).
            let hardware_profile = stt::probe_hardware();
            let recommended = stt::WhisperModel::for_size(stt::recommend_model(&hardware_profile));
            let whisper_dir = stt::resolve_whisper_model_dir();
            let whisper_descriptor =
                stt::whisper_model_set_descriptor(recommended, whisper_dir.clone());

            // Managed local-LLM engine (ADR-006): register the local-LLM GGUF
            // consent descriptor (default preset - the disclosure shown per
            // download is rebuilt for the specific target model) in the SAME
            // fail-closed gate, not a second one.
            let llm_dir = llm::resolve_llm_model_dir();
            let llm_descriptor = llm::local_llm_model_set_descriptor(
                llm::GgufModel::default_model(),
                llm_dir.clone(),
            );

            // Settings-time model switcher (TASK-026): honor a persisted
            // selection from a PRIOR Settings switch when it still names a
            // catalog tier the CURRENT hardware profile allows; otherwise fall
            // back to the hardware-recommended default (today's behavior).
            let settings_store = app.store("settings.json")?;
            let stored_stt_model = settings_store
                .get("sttModel")
                .and_then(|v| v.as_str().map(str::to_string));
            let selected_model = stt::resolve_selected_model(
                stored_stt_model.as_deref(),
                recommended,
                &hardware_profile,
            );
            let gate = Arc::new(models::ModelGate::new(
                consent,
                vec![ocr_descriptor, whisper_descriptor, llm_descriptor],
            ));

            app.manage(models::ModelConsent::new(Arc::clone(&gate)));

            // Managed local-LLM engine state: the process manager over the
            // production OS spawn+health backend, plus the consent gate + GGUF
            // cache dir. The llama-server child is killed on app exit (see the
            // RunEvent handler below).
            let llm_server = Arc::new(llm::LocalLlmServer::new(Arc::new(
                llm::process::OsServerBackend::new(),
            )));
            app.manage(llm::LocalLlmEngine::new(
                Arc::clone(&gate),
                llm_dir,
                llm_server,
            ));

            // One-heavy-session-at-a-time coordinator (FR-05 / BR-04): at most one
            // heavy model set (ORT OCR OR whisper STT) is resident at a time.
            // Shared by both pipelines; each registers its unload hook so starting
            // one drops the other and stopping a session returns to idle.
            let coordinator = Arc::new(core::HeavySessionCoordinator::new());

            app.manage(shell::region::RegionPipeline::new_default(
                Arc::clone(&gate),
                Arc::clone(&coordinator),
            ));
            // Live audio-translation session pipeline (FR-01/FR-05): capture ->
            // whisper STT -> provider translate -> audio:caption. The whisper
            // model + context load lazily; the session starts on demand.
            app.manage(shell::audio_session::AudioSessionPipeline::new_default(
                Arc::new(keys::KeyStore::new_os_keychain()),
                gate,
                selected_model,
                whisper_dir,
                coordinator,
            ));

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
            shell::region::close_region_preview,
            shell::region::nudge_region_preview,
            shell::audio_session::start_audio_session,
            shell::audio_session::stop_audio_session,
            shell::audio_session::list_stt_models,
            shell::audio_session::request_stt_model_switch,
            shell::audio_session::confirm_stt_model_switch,
            shell::audio_session::cancel_stt_model_download,
            shell::audio_session::delete_stt_model,
            shell::caption::open_caption_overlay,
            shell::caption::close_caption_overlay,
            shell::caption::nudge_caption_overlay,
            shell::settings::open_settings,
            shell::history::open_history,
            shell::hotkeys::get_hotkey_config,
            shell::hotkeys::set_hotkey_config,
            commands::keys::provider_key_statuses,
            commands::keys::save_provider_key,
            commands::keys::check_provider_key,
            commands::keys::delete_provider_key,
            commands::providers::provider_picker_metadata,
            commands::providers::check_local_provider_connection,
            llm::list_llm_models,
            llm::request_llm_model_download,
            llm::confirm_llm_model_download,
            llm::cancel_llm_model_download,
            llm::delete_llm_model,
            llm::start_llm_server,
            llm::stop_llm_server,
            llm::llm_server_status,
            models::model_consent_status,
            models::grant_model_consent,
            models::revoke_model_consent,
            // e2e acceptance gate (TASK-022): WebDriver-only region probe,
            // compiled ONLY under the `e2e` feature - absent from production.
            #[cfg(feature = "e2e")]
            shell::region::e2e_region_probe,
            // e2e acceptance gate (TASK-027): WebDriver-only open-window-label
            // observability, compiled ONLY under the `e2e` feature.
            #[cfg(feature = "e2e")]
            shell::windows::e2e_list_window_labels,
        ])
        // build (not run) so the RunEvent loop can kill the managed
        // llama-server child on exit - a std::process::Child is not reaped when
        // the parent dies on Windows, so an orphaned server would keep the port
        // + GPU busy (ADR-006 crash-isolation cleanup).
        .build(tauri::generate_context!())
        // expect is acceptable here: outermost entry point, failure to start the
        // Tauri runtime is unrecoverable and must abort with a message.
        .expect("error while running tauri application")
        .run(|app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                use tauri::Manager;
                if let Some(engine) = app_handle.try_state::<llm::LocalLlmEngine>() {
                    let server = engine.server();
                    // stop() is a quick kill; block briefly so the child is
                    // reaped before the process exits.
                    let _ = tauri::async_runtime::block_on(server.stop());
                }
            }
        });
}
