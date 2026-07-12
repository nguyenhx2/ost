//! Shared first-run model-download consent + download facility (TASK-007).
//!
//! ONE facility, generic over a [`ModelSetDescriptor`], reused by every consumer
//! that must fetch large models on first run: OCR (PP-OCRv5, first consumer) and
//! whisper STT (Phase 2). It enforces, IN RUST, that no model download happens
//! until the user grants consent over IPC (fail-closed, security-privacy.md
//! user-confirmed-first-run-download; agent-guardrails.md 5 gated outbound
//! actions), discloses the host/sizes/destination, and persists a revocable
//! consent flag (tauri-plugin-store, flags/names only).
//!
//! The download itself is delegated per consumer: OCR relies on oar-ocr's
//! `auto-download` (HTTPS + SHA-256 verified internally) once the gate allows it;
//! self-fetching consumers use [`verify::verify_sha256`]. Either way the gate is
//! the single fail-closed choke point.

mod consent;
mod descriptor;
pub mod download;
mod store;
mod verify;

use std::path::PathBuf;
use std::sync::Arc;

pub use consent::{ConsentStore, InMemoryConsentStore, ModelConsentStatus, ModelError, ModelGate};
pub use descriptor::{
    ArtifactDisclosure, ConsentDisclosure, ModelArtifact, ModelHost, ModelSetDescriptor,
};
pub use download::{stream_download_to_file, CancelFlag, DownloadBounds, StreamDownloadError};
pub use store::{StoreConsentStore, CONSENT_STORE_FILE};
pub use verify::{sha256_hex, verify_sha256};

/// Resolves the on-disk model cache directory used for disclosure and (for the
/// OCR consumer) as oar-ocr's `OAR_HOME`.
///
/// Precedence: the `OAR_HOME` env var if set, else `~/.oar` (oar-ocr's default).
/// We do NOT force-override `OAR_HOME` to a repo `models/` dir: oar-ocr owns the
/// cache layout and its SHA-256 keying, so redirecting it risks divergence for no
/// benefit - the default cache already lives outside the repo and models are
/// never committed (`.gitignore` `models/`). A deployment may still point
/// `OAR_HOME` at an app-local `models/` dir; this resolver honors it.
pub fn resolve_model_cache_dir() -> PathBuf {
    if let Some(dir) = std::env::var_os("OAR_HOME") {
        return PathBuf::from(dir);
    }
    dirs_home()
        .map(|h| h.join(".oar"))
        .unwrap_or_else(|| PathBuf::from(".oar"))
}

/// Best-effort home directory without pulling a new dependency.
fn dirs_home() -> Option<PathBuf> {
    #[cfg(windows)]
    {
        std::env::var_os("USERPROFILE").map(PathBuf::from)
    }
    #[cfg(not(windows))]
    {
        std::env::var_os("HOME").map(PathBuf::from)
    }
}

/// Managed Tauri state exposing the consent gate to the IPC commands.
pub struct ModelConsent {
    gate: Arc<ModelGate>,
}

impl ModelConsent {
    pub fn new(gate: Arc<ModelGate>) -> Self {
        Self { gate }
    }

    pub fn gate(&self) -> Arc<ModelGate> {
        Arc::clone(&self.gate)
    }
}

/// Command-boundary error - serializes to a plain string for the WebView (no
/// secret, no user content; the display strings are model ids/paths only).
impl serde::Serialize for ModelError {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}

/// Reads the consent status + disclosure for a model set (the UI shows the
/// disclosure before asking for consent).
#[tauri::command]
pub fn model_consent_status(
    state: tauri::State<'_, ModelConsent>,
    model_set_id: String,
) -> Result<ModelConsentStatus, ModelError> {
    state.gate.status(&model_set_id)
}

/// Grants first-run download consent for a model set (fail-closed gate opens).
#[tauri::command]
pub fn grant_model_consent(
    state: tauri::State<'_, ModelConsent>,
    model_set_id: String,
) -> Result<(), ModelError> {
    state.gate.grant(&model_set_id)
}

/// Revokes download consent (Settings). The next download attempt fails closed.
#[tauri::command]
pub fn revoke_model_consent(
    state: tauri::State<'_, ModelConsent>,
    model_set_id: String,
) -> Result<(), ModelError> {
    state.gate.revoke(&model_set_id)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cache_dir_honors_oar_home_override() {
        // Deterministic: with OAR_HOME set, the resolver returns exactly it.
        // (Set/restore around the assertion; single-threaded test.)
        let prev = std::env::var_os("OAR_HOME");
        std::env::set_var("OAR_HOME", "/custom/oar/cache");
        assert_eq!(
            resolve_model_cache_dir(),
            PathBuf::from("/custom/oar/cache")
        );
        match prev {
            Some(v) => std::env::set_var("OAR_HOME", v),
            None => std::env::remove_var("OAR_HOME"),
        }
    }
}
