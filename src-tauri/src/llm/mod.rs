//! Managed local-LLM translation engine (ADR-006, owner decision 2026-07-12).
//!
//! The app downloads a GGUF translation model (consent-gated, SHA-verified /
//! trust-on-first-use) and manages a `llama-server` subprocess that serves it on
//! a loopback OpenAI-compatible port. Translation then flows through the
//! EXISTING loopback-only `providers::local_openai` client pointed at the
//! managed server's base URL - this module never speaks the translate protocol
//! itself (tech-stack.md: only `providers/` talks to an LLM).
//!
//! Layout:
//! - [`model`]: the GGUF preset registry + first-run consent descriptor.
//! - [`download`]: the consent-gated, bounded, verified GGUF download (reuses
//!   `crate::models`).
//! - [`server`]: the process manager (spawn/health/kill, one-at-a-time,
//!   loopback-only) behind an injected backend so it is unit-testable.
//! - [`process`]: the production OS spawn + health backend + binary resolution.
//!
//! IPC surface (documented in `docs/architecture/api-contracts/providers.md`;
//! the Settings "Local LLM" tab is built by a separate frontend agent against
//! this contract):
//! - model management: [`list_llm_models`], [`request_llm_model_download`],
//!   [`confirm_llm_model_download`], [`cancel_llm_model_download`],
//!   [`delete_llm_model`];
//! - server control: [`start_llm_server`], [`stop_llm_server`],
//!   [`llm_server_status`].

pub mod download;
pub mod model;
pub mod process;
pub mod server;

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};

use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

use crate::models::{CancelFlag, ConsentDisclosure, ModelGate};

pub use model::{
    local_llm_model_set_descriptor, resolve_llm_model_dir, GgufModel, LOCAL_LLM_MODEL_SET_ID,
};
pub use server::{LocalLlmServer, ServerSpec, ServerStatus};

use download::{ensure_gguf_available_with_progress_and_cancel, GgufDownloadError};
use server::{ServerError, DEFAULT_CTX_SIZE, DEFAULT_PORT};

/// Emitted repeatedly while a local-LLM GGUF download runs (Settings progress
/// bar). Kept in sync with `src/lib/ipc.ts` and the providers contract doc.
pub const EVENT_LLM_MODEL_DOWNLOAD_PROGRESS: &str = "llm:model-download-progress";

/// Managed Tauri state for the local-LLM engine.
pub struct LocalLlmEngine {
    gate: Arc<ModelGate>,
    model_dir: PathBuf,
    server: Arc<LocalLlmServer>,
    /// Cancel flags for in-flight downloads, keyed by model id (mirrors the STT
    /// download cancellation). Cleared once a download settles.
    downloads: Mutex<HashMap<String, CancelFlag>>,
}

impl LocalLlmEngine {
    /// Wires the engine over the shared consent `gate`, the GGUF cache `dir`,
    /// and a `server` manager (production: `OsServerBackend`).
    pub fn new(gate: Arc<ModelGate>, model_dir: PathBuf, server: Arc<LocalLlmServer>) -> Self {
        Self {
            gate,
            model_dir,
            server,
            downloads: Mutex::new(HashMap::new()),
        }
    }

    /// The managed server, for app-exit shutdown wiring in `lib.rs`.
    pub fn server(&self) -> Arc<LocalLlmServer> {
        Arc::clone(&self.server)
    }

    fn register_download(&self, model_id: &str) -> CancelFlag {
        let flag: CancelFlag = Arc::new(AtomicBool::new(false));
        if let Ok(mut guard) = self.downloads.lock() {
            guard.insert(model_id.to_string(), Arc::clone(&flag));
        }
        flag
    }

    fn clear_download(&self, model_id: &str) {
        if let Ok(mut guard) = self.downloads.lock() {
            guard.remove(model_id);
        }
    }

    fn cancel_download(&self, model_id: &str) {
        if let Ok(guard) = self.downloads.lock() {
            if let Some(flag) = guard.get(model_id) {
                flag.store(true, std::sync::atomic::Ordering::SeqCst);
            }
        }
    }
}

/// One row of [`list_llm_models`]. Serializes to camelCase; never a secret.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LlmModelInfo {
    pub id: String,
    pub label: String,
    pub approx_download_bytes: u64,
    pub approx_ram_bytes: u64,
    /// Whether the GGUF file is already present on disk.
    pub downloaded: bool,
    /// The first-run default preset.
    pub is_default: bool,
    /// Whether the managed server is currently running this model.
    pub running: bool,
}

/// Builds the [`LlmModelInfo`] rows for every preset. Pure (dir + running model
/// in, rows out) so it is unit-tested without a server or the filesystem beyond
/// a temp dir.
#[must_use]
pub fn build_llm_model_infos(
    model_dir: &std::path::Path,
    running_model_id: Option<&str>,
) -> Vec<LlmModelInfo> {
    GgufModel::CATALOG
        .iter()
        .map(|m| LlmModelInfo {
            id: m.id.to_string(),
            label: m.label.to_string(),
            approx_download_bytes: m.approx_download_bytes,
            approx_ram_bytes: m.approx_ram_bytes,
            downloaded: m.path_in(model_dir).exists(),
            is_default: m.default,
            running: running_model_id == Some(m.id),
        })
        .collect()
}

/// Outcome of [`request_llm_model_download`], tagged by `status`.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum LlmModelDownloadOutcome {
    /// The model is already on disk - nothing to download.
    AlreadyDownloaded,
    /// The model is not on disk; `disclosure` names the exact download size and
    /// host. The caller shows a confirmation dialog then calls
    /// [`confirm_llm_model_download`].
    ConsentRequired { disclosure: ConsentDisclosure },
}

/// Payload of [`EVENT_LLM_MODEL_DOWNLOAD_PROGRESS`].
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LlmModelDownloadProgress {
    pub model_id: String,
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
}

/// Errors from a local-LLM model download request. Serializes to `{ kind }`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, thiserror::Error)]
pub enum LlmModelError {
    #[error("unknown local-LLM model id")]
    UnknownModel,
    #[error("the local-LLM model download failed")]
    Download,
    #[error("the local-LLM model download was cancelled")]
    Cancelled,
    #[error("a local-LLM session is active")]
    SessionActive,
    #[error("could not delete the local-LLM model file")]
    Io,
}

impl LlmModelError {
    fn kind(&self) -> &'static str {
        match self {
            LlmModelError::UnknownModel => "unknownModel",
            LlmModelError::Download => "download",
            LlmModelError::Cancelled => "cancelled",
            LlmModelError::SessionActive => "sessionActive",
            LlmModelError::Io => "io",
        }
    }
}

impl Serialize for LlmModelError {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        use serde::ser::SerializeStruct;
        let mut s = serializer.serialize_struct("LlmModelError", 1)?;
        s.serialize_field("kind", self.kind())?;
        s.end()
    }
}

/// Errors from the managed-server control commands. Serializes to `{ kind }`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, thiserror::Error)]
pub enum LlmServerCommandError {
    #[error("unknown local-LLM model id")]
    UnknownModel,
    #[error("the model must be downloaded before starting the server")]
    NotDownloaded,
    #[error("the llama-server binary was not found")]
    BinaryNotFound,
    #[error("failed to start llama-server")]
    SpawnFailed,
    #[error("llama-server exited during startup")]
    ExitedDuringStartup,
    #[error("llama-server did not become ready in time")]
    ReadinessTimeout,
    #[error("failed to stop llama-server")]
    StopFailed,
}

impl LlmServerCommandError {
    fn kind(&self) -> &'static str {
        match self {
            LlmServerCommandError::UnknownModel => "unknownModel",
            LlmServerCommandError::NotDownloaded => "notDownloaded",
            LlmServerCommandError::BinaryNotFound => "binaryNotFound",
            LlmServerCommandError::SpawnFailed => "spawnFailed",
            LlmServerCommandError::ExitedDuringStartup => "exitedDuringStartup",
            LlmServerCommandError::ReadinessTimeout => "readinessTimeout",
            LlmServerCommandError::StopFailed => "stopFailed",
        }
    }
}

impl Serialize for LlmServerCommandError {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        use serde::ser::SerializeStruct;
        let mut s = serializer.serialize_struct("LlmServerCommandError", 1)?;
        s.serialize_field("kind", self.kind())?;
        s.end()
    }
}

impl From<ServerError> for LlmServerCommandError {
    fn from(err: ServerError) -> Self {
        match err {
            ServerError::BinaryNotFound(_) => LlmServerCommandError::BinaryNotFound,
            ServerError::ModelNotFound(_) => LlmServerCommandError::NotDownloaded,
            ServerError::NonLoopbackHost | ServerError::Spawn(_) => {
                LlmServerCommandError::SpawnFailed
            }
            ServerError::ExitedDuringStartup { .. } => LlmServerCommandError::ExitedDuringStartup,
            ServerError::ReadinessTimeout => LlmServerCommandError::ReadinessTimeout,
            ServerError::Kill(_) => LlmServerCommandError::StopFailed,
        }
    }
}

/// The managed-server status the WebView renders (serializes to camelCase).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LlmServerStatusView {
    pub running: bool,
    pub model_id: Option<String>,
    pub base_url: Option<String>,
    pub port: Option<u16>,
}

impl From<ServerStatus> for LlmServerStatusView {
    fn from(s: ServerStatus) -> Self {
        Self {
            running: s.running,
            model_id: s.model_id,
            base_url: s.base_url,
            port: s.port,
        }
    }
}

// ---------------------------------------------------------------------------
// IPC commands
// ---------------------------------------------------------------------------

/// Lists every local-LLM preset with download/running state (Settings picker).
#[tauri::command]
pub async fn list_llm_models(engine: State<'_, LocalLlmEngine>) -> Result<Vec<LlmModelInfo>, ()> {
    let status = engine.server.status().await;
    Ok(build_llm_model_infos(
        &engine.model_dir,
        status.model_id.as_deref(),
    ))
}

/// Decides whether `model_id` needs a download (returns the consent disclosure)
/// or is already present. Read-only; never triggers a fetch.
#[tauri::command]
pub fn request_llm_model_download(
    engine: State<'_, LocalLlmEngine>,
    model_id: String,
) -> Result<LlmModelDownloadOutcome, LlmModelError> {
    let model = GgufModel::for_id(&model_id).ok_or(LlmModelError::UnknownModel)?;
    if model.path_in(&engine.model_dir).exists() {
        return Ok(LlmModelDownloadOutcome::AlreadyDownloaded);
    }
    let disclosure = local_llm_model_set_descriptor(model, engine.model_dir.clone()).disclosure();
    Ok(LlmModelDownloadOutcome::ConsentRequired { disclosure })
}

/// Grants first-run consent (idempotent) and downloads `model_id`, emitting
/// [`EVENT_LLM_MODEL_DOWNLOAD_PROGRESS`] and observing a cancel flag.
#[tauri::command]
pub async fn confirm_llm_model_download(
    app: AppHandle,
    engine: State<'_, LocalLlmEngine>,
    model_id: String,
) -> Result<(), LlmModelError> {
    let model = GgufModel::for_id(&model_id).ok_or(LlmModelError::UnknownModel)?;

    engine
        .gate
        .grant(LOCAL_LLM_MODEL_SET_ID)
        .map_err(|_| LlmModelError::Download)?;

    let dir = engine.model_dir.clone();
    let progress_app = app.clone();
    let progress_id = model_id.clone();
    let cancel = engine.register_download(&model_id);
    let result = ensure_gguf_available_with_progress_and_cancel(
        model,
        &dir,
        &engine.gate,
        &cancel,
        move |downloaded, total| {
            let _ = progress_app.emit(
                EVENT_LLM_MODEL_DOWNLOAD_PROGRESS,
                LlmModelDownloadProgress {
                    model_id: progress_id.clone(),
                    downloaded_bytes: downloaded,
                    total_bytes: total,
                },
            );
        },
    )
    .await;
    engine.clear_download(&model_id);

    result.map(|_| ()).map_err(|err| match err {
        GgufDownloadError::Cancelled { .. } => LlmModelError::Cancelled,
        _ => LlmModelError::Download,
    })
}

/// Cancels `model_id`'s in-flight download, if any (no-op otherwise).
#[tauri::command]
pub fn cancel_llm_model_download(engine: State<'_, LocalLlmEngine>, model_id: String) {
    engine.cancel_download(&model_id);
}

/// Deletes a downloaded GGUF (and its digest sidecar) from disk. Refuses while
/// the managed server is running that model (deleting an in-use file would
/// corrupt it). Idempotent when the file is already absent.
#[tauri::command]
pub async fn delete_llm_model(
    engine: State<'_, LocalLlmEngine>,
    model_id: String,
) -> Result<(), LlmModelError> {
    let model = GgufModel::for_id(&model_id).ok_or(LlmModelError::UnknownModel)?;
    let status = engine.server.status().await;
    if status.running && status.model_id.as_deref() == Some(model.id) {
        return Err(LlmModelError::SessionActive);
    }
    let path = model.path_in(&engine.model_dir);
    if path.exists() {
        std::fs::remove_file(&path).map_err(|_| LlmModelError::Io)?;
    }
    let sidecar = model.digest_sidecar_in(&engine.model_dir);
    if sidecar.exists() {
        let _ = std::fs::remove_file(&sidecar);
    }
    Ok(())
}

/// Starts (or restarts) the managed server for `model_id`, which MUST already
/// be downloaded. Returns the running status (incl. the loopback base URL the
/// frontend points the `local_openai` provider at).
#[tauri::command]
pub async fn start_llm_server(
    engine: State<'_, LocalLlmEngine>,
    model_id: String,
) -> Result<LlmServerStatusView, LlmServerCommandError> {
    let model = GgufModel::for_id(&model_id).ok_or(LlmServerCommandError::UnknownModel)?;
    let model_path = model.path_in(&engine.model_dir);
    if !model_path.exists() {
        return Err(LlmServerCommandError::NotDownloaded);
    }
    let binary_path = process::resolve_llama_server_binary()?;
    let spec = ServerSpec {
        binary_path,
        model_path,
        port: DEFAULT_PORT,
        gpu_layers: model.recommended_gpu_layers,
        ctx_size: DEFAULT_CTX_SIZE,
        model_id: model.id.to_string(),
    };
    engine.server.start(spec).await?;
    Ok(engine.server.status().await.into())
}

/// Stops the managed server (idempotent).
#[tauri::command]
pub async fn stop_llm_server(
    engine: State<'_, LocalLlmEngine>,
) -> Result<(), LlmServerCommandError> {
    engine.server.stop().await?;
    Ok(())
}

/// The managed server's current status.
#[tauri::command]
pub async fn llm_server_status(
    engine: State<'_, LocalLlmEngine>,
) -> Result<LlmServerStatusView, ()> {
    Ok(engine.server.status().await.into())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp_dir(tag: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!(
            "ost-llm-mod-{tag}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn model_infos_flag_downloaded_default_and_running() {
        let dir = tmp_dir("infos");
        // Only the default is on disk.
        std::fs::write(GgufModel::HUNYUAN_MT_7B.path_in(&dir), b"x").unwrap();

        let rows = build_llm_model_infos(&dir, Some("qwen3-14b"));
        assert_eq!(rows.len(), 2);
        let default_row = rows.iter().find(|r| r.id == "hunyuan-mt-7b").unwrap();
        assert!(default_row.downloaded);
        assert!(default_row.is_default);
        assert!(!default_row.running);
        let qwen = rows.iter().find(|r| r.id == "qwen3-14b").unwrap();
        assert!(!qwen.downloaded);
        assert!(qwen.running, "the running model must be flagged");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn model_error_serializes_only_the_kind_tag() {
        assert_eq!(
            serde_json::to_value(LlmModelError::Cancelled).unwrap(),
            serde_json::json!({ "kind": "cancelled" })
        );
    }

    #[test]
    fn server_command_error_maps_from_server_error() {
        assert_eq!(
            LlmServerCommandError::from(ServerError::ReadinessTimeout).kind(),
            "readinessTimeout"
        );
        assert_eq!(
            LlmServerCommandError::from(ServerError::ExitedDuringStartup { code: Some(1) }).kind(),
            "exitedDuringStartup"
        );
        assert_eq!(
            LlmServerCommandError::from(ServerError::ModelNotFound("m".into())).kind(),
            "notDownloaded"
        );
    }

    #[test]
    fn download_outcome_serializes_tagged() {
        let json = serde_json::to_value(LlmModelDownloadOutcome::AlreadyDownloaded).unwrap();
        assert_eq!(json["status"], "alreadyDownloaded");
    }

    #[test]
    fn status_view_serializes_to_camel_case() {
        let view = LlmServerStatusView::from(ServerStatus {
            running: true,
            model_id: Some("hunyuan-mt-7b".into()),
            base_url: Some("http://127.0.0.1:8177".into()),
            port: Some(8177),
        });
        let json = serde_json::to_value(&view).unwrap();
        assert_eq!(json["running"], true);
        assert_eq!(json["modelId"], "hunyuan-mt-7b");
        assert_eq!(json["baseUrl"], "http://127.0.0.1:8177");
    }
}
