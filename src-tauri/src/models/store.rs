//! Persisted [`ConsentStore`] backed by tauri-plugin-store.
//!
//! Stores ONLY boolean consent flags keyed by model-set id in a plain JSON store
//! (`model-consent.json`) - never a secret, never user content
//! (security-privacy.md: settings storage holds no secrets). Consent survives
//! restarts (persisted) and is revocable (the flag is flipped back to false).

use std::sync::Arc;

use tauri::Runtime;
use tauri_plugin_store::Store;

use super::consent::{ConsentStore, ModelError};

/// The tauri-plugin-store file name for consent flags.
pub const CONSENT_STORE_FILE: &str = "model-consent.json";

/// Namespaced key for a model set's consent flag (flags/names only).
fn consent_key(model_set_id: &str) -> String {
    format!("model-consent.{model_set_id}")
}

/// tauri-plugin-store-backed consent persistence.
pub struct StoreConsentStore<R: Runtime> {
    store: Arc<Store<R>>,
}

impl<R: Runtime> StoreConsentStore<R> {
    /// Wraps an already-loaded plugin store (obtained via `app.store(...)`).
    pub fn new(store: Arc<Store<R>>) -> Self {
        Self { store }
    }
}

impl<R: Runtime> ConsentStore for StoreConsentStore<R> {
    fn is_granted(&self, model_set_id: &str) -> Result<bool, ModelError> {
        Ok(self
            .store
            .get(consent_key(model_set_id))
            .and_then(|v| v.as_bool())
            .unwrap_or(false))
    }

    fn set_granted(&self, model_set_id: &str, granted: bool) -> Result<(), ModelError> {
        self.store.set(consent_key(model_set_id), granted);
        // Persist immediately so consent survives a crash before auto-save.
        self.store
            .save()
            .map_err(|e| ModelError::Persistence(e.to_string()))
    }
}
