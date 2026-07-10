//! Global hotkeys (AC-04.1): a reconfigurable set of system-wide shortcuts that
//! work while ANOTHER application has focus, via tauri-plugin-global-shortcut.
//!
//! The set (OI-04 default) covers the background-control essentials: toggle the
//! live audio session, activate region select, and show/hide the active overlay.
//! Bindings are user-configurable in Settings and persisted through
//! tauri-plugin-store (`settings.json`, key `hotkeys` - NAMES only, never a key
//! or captured content). Registration is fail-soft: a binding the OS refuses
//! (already owned by another app) is reported to the UI, never a crash
//! (agent-guardrails.md). Hotkeys ONLY trigger the app's own actions - they
//! never auto-send or auto-type a translation anywhere (human-in-the-loop.md).

use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutEvent, ShortcutState};
use tauri_plugin_store::StoreExt;

use super::audio_session::{AudioSessionPipeline, AudioSessionRequest};

/// The settings-store file + key the persisted hotkey config lives under. Shares
/// `settings.json` with the provider selection (`providerSelection`); this key
/// holds NAMES only (accelerator strings), never a secret (BR-02).
const SETTINGS_STORE_FILE: &str = "settings.json";
const HOTKEYS_STORE_KEY: &str = "hotkeys";
/// Provider-selection key (owned by `src/lib/settings.ts`) - read here to build
/// an [`AudioSessionRequest`] when the audio hotkey starts a session with no UI.
const PROVIDER_SELECTION_KEY: &str = "providerSelection";

/// One global-hotkey-triggerable action. Each maps to exactly one binding.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HotkeyAction {
    /// Start the live audio session if idle, stop it if running (AC-04.1).
    ToggleAudio,
    /// Open the fullscreen region-select overlay (AC-04.1 / AC-02.1).
    RegionSelect,
    /// Show/hide the active overlay (caption or region preview) - AC-04.1.
    ToggleOverlay,
}

impl HotkeyAction {
    /// Stable id shared with the WebView (`src/lib/ipc.ts` `HotkeyAction`).
    pub const fn id(self) -> &'static str {
        match self {
            HotkeyAction::ToggleAudio => "toggleAudio",
            HotkeyAction::RegionSelect => "regionSelect",
            HotkeyAction::ToggleOverlay => "toggleOverlay",
        }
    }
}

/// The reconfigurable hotkey bindings (accelerator strings, e.g. `"Ctrl+Alt+R"`).
/// Serializes to camelCase for the WebView + the persisted store.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HotkeyConfig {
    pub toggle_audio: String,
    pub region_select: String,
    pub toggle_overlay: String,
}

impl Default for HotkeyConfig {
    /// The OI-04 sensible default set. `Ctrl+Alt+<letter>` combos avoid the
    /// common single-modifier OS/app shortcuts while staying easy to reach.
    fn default() -> Self {
        Self {
            toggle_audio: "Ctrl+Alt+A".to_string(),
            region_select: "Ctrl+Alt+R".to_string(),
            toggle_overlay: "Ctrl+Alt+O".to_string(),
        }
    }
}

impl HotkeyConfig {
    /// `(action, accelerator)` for every binding, in stable order.
    fn entries(&self) -> [(HotkeyAction, &str); 3] {
        [
            (HotkeyAction::ToggleAudio, self.toggle_audio.as_str()),
            (HotkeyAction::RegionSelect, self.region_select.as_str()),
            (HotkeyAction::ToggleOverlay, self.toggle_overlay.as_str()),
        ]
    }

    /// Parse each binding; the first that fails yields `InvalidBinding`, then any
    /// two bindings resolving to the SAME shortcut yield `Duplicate`. Returns the
    /// parsed shortcuts (in stable binding order) when the set is coherent.
    pub fn parse_all(&self) -> Result<[(HotkeyAction, Shortcut); 3], HotkeyError> {
        let mut parsed: Vec<(HotkeyAction, Shortcut)> = Vec::with_capacity(3);
        for (action, accel) in self.entries() {
            let shortcut = accel
                .parse::<Shortcut>()
                .map_err(|_| HotkeyError::InvalidBinding(action))?;
            parsed.push((action, shortcut));
        }
        for i in 0..parsed.len() {
            for j in (i + 1)..parsed.len() {
                if parsed[i].1 == parsed[j].1 {
                    return Err(HotkeyError::Duplicate(parsed[j].0));
                }
            }
        }
        // Length is exactly 3 by construction (entries() is fixed-size); the
        // tuple elements are Copy, so indexing copies without a clone.
        Ok([parsed[0], parsed[1], parsed[2]])
    }

    /// Which action (if any) a pressed shortcut maps to. Unparseable bindings are
    /// skipped (they can never fire because they were never registered).
    pub fn action_for(&self, pressed: &Shortcut) -> Option<HotkeyAction> {
        self.entries().into_iter().find_map(|(action, accel)| {
            accel
                .parse::<Shortcut>()
                .ok()
                .filter(|s| s == pressed)
                .map(|_| action)
        })
    }
}

/// Errors from reconfiguring hotkeys. Serializes to `{ kind, action? }` for the
/// WebView (never a secret); the UI maps `kind` to an i18n message.
#[derive(Debug, thiserror::Error)]
pub enum HotkeyError {
    #[error("invalid accelerator")]
    InvalidBinding(HotkeyAction),
    #[error("duplicate accelerator")]
    Duplicate(HotkeyAction),
    #[error("accelerator already in use")]
    Conflict(HotkeyAction),
    #[error("could not persist hotkey config")]
    Store,
}

impl HotkeyError {
    fn kind(&self) -> &'static str {
        match self {
            HotkeyError::InvalidBinding(_) => "invalidBinding",
            HotkeyError::Duplicate(_) => "duplicate",
            HotkeyError::Conflict(_) => "conflict",
            HotkeyError::Store => "store",
        }
    }

    fn action(&self) -> Option<HotkeyAction> {
        match self {
            HotkeyError::InvalidBinding(a)
            | HotkeyError::Duplicate(a)
            | HotkeyError::Conflict(a) => Some(*a),
            HotkeyError::Store => None,
        }
    }
}

impl Serialize for HotkeyError {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        use serde::ser::SerializeStruct;
        let mut s = serializer.serialize_struct("HotkeyError", 2)?;
        s.serialize_field("kind", self.kind())?;
        s.serialize_field("action", &self.action().map(HotkeyAction::id))?;
        s.end()
    }
}

/// Managed state: the current effective hotkey config, read by the global
/// dispatch handler to map a pressed shortcut to its action.
pub struct HotkeyManager {
    config: Mutex<HotkeyConfig>,
}

impl HotkeyManager {
    fn new(config: HotkeyConfig) -> Self {
        Self {
            config: Mutex::new(config),
        }
    }

    /// A snapshot of the current config (cloned; the lock is not held by callers).
    pub fn config(&self) -> HotkeyConfig {
        self.config.lock().map(|c| c.clone()).unwrap_or_default()
    }

    fn set(&self, config: HotkeyConfig) {
        if let Ok(mut guard) = self.config.lock() {
            *guard = config;
        }
    }
}

/// Build the global-shortcut plugin. Shortcuts are registered dynamically at
/// [`init`] time (and on reconfigure), so the builder only carries the shared
/// dispatch handler - nothing is pre-registered here.
pub fn plugin<R: Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri_plugin_global_shortcut::Builder::<R>::new()
        .with_handler(dispatch)
        .build()
}

/// One-time hotkey setup: load the persisted (or default) config, publish it as
/// managed state, and register the bindings. Registration is best-effort - a
/// binding the OS rejects is logged and skipped so startup never fails.
pub fn init<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let config = load_config(app);
    app.manage(HotkeyManager::new(config.clone()));
    let shortcut = app.global_shortcut();
    let _ = shortcut.unregister_all();
    if let Ok(parsed) = config.parse_all() {
        for (action, sc) in parsed {
            if let Err(error) = shortcut.register(sc) {
                eprintln!("hotkey {} could not be registered: {error}", action.id());
            }
        }
    }
    Ok(())
}

/// Load the persisted config from the settings store, falling back to the
/// default set when absent or corrupt.
fn load_config<R: Runtime>(app: &AppHandle<R>) -> HotkeyConfig {
    let Ok(store) = app.store(SETTINGS_STORE_FILE) else {
        return HotkeyConfig::default();
    };
    store
        .get(HOTKEYS_STORE_KEY)
        .and_then(|v| serde_json::from_value::<HotkeyConfig>(v).ok())
        .unwrap_or_default()
}

/// Persist the config to the settings store (NAMES only, never a secret).
fn persist_config<R: Runtime>(
    app: &AppHandle<R>,
    config: &HotkeyConfig,
) -> Result<(), HotkeyError> {
    let store = app
        .store(SETTINGS_STORE_FILE)
        .map_err(|_| HotkeyError::Store)?;
    let value = serde_json::to_value(config).map_err(|_| HotkeyError::Store)?;
    store.set(HOTKEYS_STORE_KEY, value);
    store.save().map_err(|_| HotkeyError::Store)?;
    Ok(())
}

/// The global dispatch handler: on a key-DOWN, map the pressed shortcut to its
/// action via the managed config and run it. Any failure is logged, never
/// propagated (a failed window open must not kill the handler thread).
fn dispatch<R: Runtime>(app: &AppHandle<R>, shortcut: &Shortcut, event: ShortcutEvent) {
    if event.state() != ShortcutState::Pressed {
        return;
    }
    let action = app.state::<HotkeyManager>().config().action_for(shortcut);
    if let Some(action) = action {
        run_action(app, action);
    }
}

/// Execute a hotkey action. All actions are the app's OWN windows/session - none
/// send, type, or click anything outside the app (human-in-the-loop.md).
fn run_action<R: Runtime>(app: &AppHandle<R>, action: HotkeyAction) {
    match action {
        HotkeyAction::RegionSelect => {
            if let Err(error) = crate::shell::region::open_selection_window(app) {
                eprintln!("failed to open region selection window: {error}");
            }
        }
        HotkeyAction::ToggleAudio => toggle_audio(app),
        HotkeyAction::ToggleOverlay => toggle_overlay(app),
    }
}

/// Toggle the live audio session: stop + close it when the overlay is open,
/// otherwise start one. Shared by the audio hotkey.
fn toggle_audio<R: Runtime>(app: &AppHandle<R>) {
    if app
        .get_webview_window(super::caption::CAPTION_WINDOW_LABEL)
        .is_some()
    {
        stop_audio(app);
    } else {
        start_audio(app);
    }
}

/// Start a live audio session from the persisted provider/model selection and
/// default languages (there is no UI in the loop for a global hotkey / tray
/// item). No-op when the overlay is already open. Falls back to opening Settings
/// when no provider is configured (human-in-the-loop.md: never a silent failure).
pub fn start_audio<R: Runtime>(app: &AppHandle<R>) {
    if app
        .get_webview_window(super::caption::CAPTION_WINDOW_LABEL)
        .is_some()
    {
        return;
    }
    match read_audio_request(app) {
        Some(request) => {
            if let Err(error) = super::caption::open_caption_window(app, &request) {
                eprintln!("failed to open caption overlay: {error}");
            }
        }
        None => {
            if let Err(error) = crate::shell::settings::open_settings_window(app) {
                eprintln!("failed to open settings window: {error}");
            }
        }
    }
}

/// Stop the live audio session and close the caption overlay (idempotent).
/// Closing the window emits `audio:stopped` via the shared window-event handler.
pub fn stop_audio<R: Runtime>(app: &AppHandle<R>) {
    app.state::<AudioSessionPipeline>().stop();
    super::caption::close_caption_window(app);
}

/// Show/hide whichever overlay is active (caption preferred, then region
/// preview). No-op when neither is open.
fn toggle_overlay<R: Runtime>(app: &AppHandle<R>) {
    let label = if app
        .get_webview_window(super::caption::CAPTION_WINDOW_LABEL)
        .is_some()
    {
        super::caption::CAPTION_WINDOW_LABEL
    } else {
        super::region::PREVIEW_WINDOW_LABEL
    };
    if let Some(window) = app.get_webview_window(label) {
        match window.is_visible() {
            Ok(true) => {
                let _ = window.hide();
            }
            _ => {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }
    }
}

/// Build the audio-session request from the persisted provider selection. Returns
/// `None` when no valid provider/model is stored. Languages use the session
/// defaults (auto source, `vi` target) since the hotkey has no UI to pick them.
fn read_audio_request<R: Runtime>(app: &AppHandle<R>) -> Option<AudioSessionRequest> {
    let store = app.store(SETTINGS_STORE_FILE).ok()?;
    let selection = store.get(PROVIDER_SELECTION_KEY)?;
    let (provider, model) = provider_model_from_selection(&selection)?;
    Some(AudioSessionRequest {
        provider,
        model,
        source_language: None,
        target_language: None,
    })
}

/// Extract `(defaultProvider, models[defaultProvider])` from the persisted
/// `providerSelection` value. Factored out for unit testing without a store.
fn provider_model_from_selection(value: &serde_json::Value) -> Option<(String, String)> {
    let provider = value.get("defaultProvider")?.as_str()?.to_string();
    let model = value.get("models")?.get(&provider)?.as_str()?.to_string();
    if provider.is_empty() || model.is_empty() {
        return None;
    }
    Some((provider, model))
}

/// Current effective hotkey config (Settings reads this to render the bindings).
#[tauri::command]
pub fn get_hotkey_config(manager: tauri::State<'_, HotkeyManager>) -> HotkeyConfig {
    manager.config()
}

/// Reconfigure the hotkeys (AC-04.1): validate, re-register with the OS, persist,
/// and publish. Registration conflicts roll back to the previous set and return
/// a typed error so the UI can report which binding is unavailable - the running
/// bindings are never left broken (agent-guardrails.md).
#[tauri::command]
pub fn set_hotkey_config(
    app: AppHandle,
    manager: tauri::State<'_, HotkeyManager>,
    config: HotkeyConfig,
) -> Result<HotkeyConfig, HotkeyError> {
    let parsed = config.parse_all()?;
    let previous = manager.config();

    let shortcut = app.global_shortcut();
    let _ = shortcut.unregister_all();

    let mut registered: Vec<Shortcut> = Vec::with_capacity(parsed.len());
    for (action, sc) in parsed.iter() {
        match shortcut.register(*sc) {
            Ok(()) => registered.push(*sc),
            Err(_) => {
                // Roll back to the previous, known-good set before reporting.
                for sc in &registered {
                    let _ = shortcut.unregister(*sc);
                }
                if let Ok(prev_parsed) = previous.parse_all() {
                    for (_, prev_sc) in prev_parsed {
                        let _ = shortcut.register(prev_sc);
                    }
                }
                return Err(HotkeyError::Conflict(*action));
            }
        }
    }

    persist_config(&app, &config)?;
    manager.set(config.clone());
    Ok(config)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_config_parses_and_is_conflict_free() {
        let config = HotkeyConfig::default();
        let parsed = config.parse_all().expect("default set must be coherent");
        assert_eq!(parsed.len(), 3);
    }

    #[test]
    fn invalid_binding_is_reported_with_its_action() {
        let config = HotkeyConfig {
            toggle_audio: "not a shortcut".to_string(),
            ..HotkeyConfig::default()
        };
        match config.parse_all() {
            Err(HotkeyError::InvalidBinding(HotkeyAction::ToggleAudio)) => {}
            other => panic!("expected InvalidBinding(ToggleAudio), got {other:?}"),
        }
    }

    #[test]
    fn duplicate_bindings_are_rejected() {
        let config = HotkeyConfig {
            toggle_audio: "Ctrl+Alt+R".to_string(),
            region_select: "Ctrl+Alt+R".to_string(),
            toggle_overlay: "Ctrl+Alt+O".to_string(),
        };
        match config.parse_all() {
            Err(HotkeyError::Duplicate(HotkeyAction::RegionSelect)) => {}
            other => panic!("expected Duplicate(RegionSelect), got {other:?}"),
        }
    }

    #[test]
    fn action_for_maps_a_pressed_shortcut_to_its_action() {
        let config = HotkeyConfig::default();
        let region: Shortcut = config.region_select.parse().unwrap();
        assert_eq!(config.action_for(&region), Some(HotkeyAction::RegionSelect));
    }

    #[test]
    fn action_for_returns_none_for_an_unbound_shortcut() {
        let config = HotkeyConfig::default();
        let other: Shortcut = "Ctrl+Alt+Z".parse().unwrap();
        assert_eq!(config.action_for(&other), None);
    }

    #[test]
    fn provider_model_reads_the_selected_provider_and_its_model() {
        let value = serde_json::json!({
            "defaultProvider": "gemini",
            "models": { "gemini": "gemini-2.5-flash", "openai": "gpt-5-mini" },
            "fallbackOrder": ["gemini", "openai"]
        });
        assert_eq!(
            provider_model_from_selection(&value),
            Some(("gemini".to_string(), "gemini-2.5-flash".to_string()))
        );
    }

    #[test]
    fn provider_model_is_none_when_the_selected_provider_has_no_model() {
        let value = serde_json::json!({
            "defaultProvider": "gemini",
            "models": { "openai": "gpt-5-mini" }
        });
        assert_eq!(provider_model_from_selection(&value), None);
    }

    #[test]
    fn hotkey_config_round_trips_through_json_camel_case() {
        let config = HotkeyConfig::default();
        let json = serde_json::to_string(&config).unwrap();
        assert!(json.contains("toggleAudio"));
        assert!(json.contains("regionSelect"));
        assert!(json.contains("toggleOverlay"));
        let back: HotkeyConfig = serde_json::from_str(&json).unwrap();
        assert_eq!(back, config);
    }
}
