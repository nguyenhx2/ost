//! Live audio-translation session: capture -> VAD/chunk -> STT -> provider
//! translate -> `audio:caption` event (FR-01, FR-05).
//!
//! This is the orchestration seam that ties the TASK-013 capture session, the
//! TASK-014 whisper STT stage, and the FR-03 provider layer into one streaming
//! pipeline, entirely OFF the UI thread:
//!
//! - capture + VAD + chunking run on their own OS thread ([`CaptureSession`]);
//! - each speech chunk is transcribed by whisper on `spawn_blocking` - NEVER a
//!   Tokio worker (AC-05.3; CPU-bound native inference must not stall the async
//!   runtime), verified by [`tests::transcription_runs_off_the_async_worker`];
//! - the transcript is translated through the provider layer (the ONLY path to
//!   an LLM) and emitted as an `audio:caption` event for the caption overlay
//!   (TASK-016) to render.
//!
//! Privacy (AC-01.6 / BR-01): audio stays in memory across the whole path; only
//! the transcribed + translated TEXT leaves the machine (STT is local, the
//! translate call carries text only). Transcript text is untrusted DATA and is
//! only ever placed in the data slot of the provider prompt (agent-guardrails.md
//! section 2).

use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Instant;

use async_trait::async_trait;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Runtime, State};
use tauri_plugin_store::StoreExt;
use tokio::sync::mpsc;

use crate::audio::{AudioChunk, CaptureSession};
use crate::core::{HeavySessionCoordinator, HeavySessionKind};
use crate::keys::{ApiKey, KeyStore};
use crate::models::{ConsentDisclosure, ModelGate};
use crate::providers::{
    build_provider, ProviderId, TranslationProvider, TranslationRequest, TranslationResult,
};
use crate::stt::{
    catalog, decide_switch, ensure_model_available, ensure_model_available_with_progress,
    probe_hardware, DownloadError, SpeechToText, SttError, SwitchDecision, SwitchError,
    TranscribeOptions, Transcript, WhisperModel, WhisperStt, WHISPER_MODEL_SET_ID,
};

use super::region::EVENT_MODEL_CONSENT_REQUIRED;

/// Emitted once per translated speech chunk; the caption overlay (TASK-016)
/// renders it. Kept in sync with `src/lib/ipc.ts` and
/// `docs/architecture/api-contracts/ipc.md`.
pub const EVENT_AUDIO_CAPTION: &str = "audio:caption";
/// Emitted when a chunk fails to transcribe or translate; the overlay leaves any
/// "translating" state instead of hanging (human-in-the-loop.md: no silent
/// failure). The session keeps running for subsequent chunks.
pub const EVENT_AUDIO_ERROR: &str = "audio:error";
/// Emitted (app-global) when the caption overlay window is destroyed, so a
/// separate Settings window that started the session keeps its running-state in
/// sync (TASK-016 follow-up). No payload - closing is the only signal. Kept in
/// sync with `src/lib/ipc.ts` `EVENT_AUDIO_STOPPED` and ipc.md.
pub const EVENT_AUDIO_STOPPED: &str = "audio:stopped";
/// Emitted while a Settings-time STT model switch is downloading (TASK-026);
/// the Settings UI renders a progress bar instead of a silent multi-hundred-MB
/// wait. Kept in sync with `src/lib/ipc.ts` and ipc.md.
pub const EVENT_STT_MODEL_DOWNLOAD_PROGRESS: &str = "stt:model-download-progress";

/// The settings-store file + key the selected STT model id is persisted under.
/// Shares `settings.json` with the hotkey config and provider selection
/// (`shell::hotkeys`); this key holds a catalog id NAME only, never a secret
/// (BR-02).
const SETTINGS_STORE_FILE: &str = "settings.json";
const STT_MODEL_STORE_KEY: &str = "sttModel";

/// Default caption target language (AC-01.5): Vietnamese, the product's primary
/// locale. Configurable per session via [`AudioSessionRequest::target_language`].
const DEFAULT_TARGET_LANGUAGE: &str = "vi";

/// Per-segment confidence below which a caption is flagged low-confidence
/// (AC-01.7 / BR-05). Mirrors the region OCR threshold; a segment under it is
/// marked uncertain rather than shown as a silent best-guess.
const LOW_CONFIDENCE_THRESHOLD: f32 = 0.6;

/// Errors surfaced by the audio-session commands. Serialized as a `{ kind }` tag
/// for the WebView (never a secret, never captured content); the UI maps the
/// kind to a localized, actionable message.
#[derive(Debug, thiserror::Error)]
pub enum AudioError {
    /// The requested provider id was not one of the four known providers.
    #[error("unknown provider")]
    UnknownProvider,
    /// No API key is configured for the chosen provider (AC-01.11). The UI shows
    /// an actionable "open Settings to add a key" message; the session does not
    /// start and nothing crashes.
    #[error("no provider key configured")]
    NoProviderKey,
    /// The OS keychain read failed.
    #[error("keychain error")]
    Keychain,
    /// First-run whisper model-download consent has not been granted. A
    /// `models:consent-required` event is emitted alongside so the UI can ask.
    #[error("model download consent required")]
    ConsentRequired,
    /// The whisper model could not be made available (download/verify/io).
    #[error("model unavailable")]
    Model,
    /// The audio-capture backend could not start (no endpoint / init failure).
    #[error("audio capture unavailable")]
    Capture,
    /// A session is already running (start is not re-entrant).
    #[error("a session is already running")]
    AlreadyRunning,
}

impl AudioError {
    /// Stable machine `kind` the WebView maps to an i18n message.
    fn kind(&self) -> &'static str {
        match self {
            AudioError::UnknownProvider => "unknownProvider",
            AudioError::NoProviderKey => "noProviderKey",
            AudioError::Keychain => "keychain",
            AudioError::ConsentRequired => "consentRequired",
            AudioError::Model => "model",
            AudioError::Capture => "capture",
            AudioError::AlreadyRunning => "alreadyRunning",
        }
    }
}

impl Serialize for AudioError {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        use serde::ser::SerializeStruct;
        let mut s = serializer.serialize_struct("AudioError", 1)?;
        s.serialize_field("kind", self.kind())?;
        s.end()
    }
}

/// Frontend -> core request to start a live audio-translation session.
#[derive(Debug, Clone, Default, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioSessionRequest {
    /// Provider id string (gemini/anthropic/openai/openrouter).
    pub provider: String,
    /// Opaque model id chosen in Settings.
    pub model: String,
    /// Pinned source language (AC-01.4). Empty / `"auto"` / absent = auto-detect.
    #[serde(default)]
    pub source_language: Option<String>,
    /// Target language (AC-01.5). Absent / empty = default `vi`.
    #[serde(default)]
    pub target_language: Option<String>,
}

/// The `audio:caption` event payload. Carries source + translated text, the
/// language pair, the provider/model that produced it (transparency, AC-03.5),
/// and per-segment confidence + a low-confidence flag (AC-01.7). Serializes to
/// camelCase for the WebView. All text is plain-text DATA (rendered without
/// markup interpretation, design-system.md).
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioCaptionPayload {
    /// Monotonic per-session chunk index (from the capture chunker).
    pub sequence: u64,
    /// The transcribed source text (untrusted DATA).
    pub source_text: String,
    /// The translated text (untrusted DATA; plain text only).
    pub translated_text: String,
    /// The detected or pinned source-language code (AC-01.3 / AC-01.4).
    pub source_language: String,
    /// `true` when whisper auto-detected the language, `false` when pinned.
    pub source_language_auto_detected: bool,
    /// The target language of the translation (AC-01.5).
    pub target_language: String,
    /// The provider that actually translated (AC-03.5 transparency).
    pub provider: String,
    /// The model that actually translated.
    pub model: String,
    /// Mean per-token confidence of each transcript segment, in order.
    pub segment_confidences: Vec<f32>,
    /// `true` when any segment fell below the low-confidence threshold
    /// (AC-01.7): the overlay flags the caption as uncertain.
    pub low_confidence: bool,
    /// Milliseconds since the session started (monotonic; never wall-clock, so
    /// no capture timestamp leaks - mirrors the chunk-sequence rationale).
    pub timestamp_ms: u64,
}

/// Per-session caption configuration derived from the start request.
#[derive(Debug, Clone)]
pub struct CaptionConfig {
    /// Pinned source language, or `None` to auto-detect (AC-01.4).
    pub source_language: Option<String>,
    /// Target language (AC-01.5).
    pub target_language: String,
    /// Model id passed to the provider on each translate.
    pub model_id: String,
    /// Low-confidence flag threshold (AC-01.7).
    pub low_confidence_threshold: f32,
}

impl CaptionConfig {
    /// The [`TranscribeOptions`] for this config: pinned (AC-01.4) or auto
    /// (AC-01.3).
    fn transcribe_options(&self) -> TranscribeOptions {
        match &self.source_language {
            Some(code) => TranscribeOptions::pinned(code.clone()),
            None => TranscribeOptions::auto(),
        }
    }
}

/// The translate step of the caption loop, abstracted so tests drive the loop
/// with an instant stub instead of a real provider call (testing.md: providers
/// mocked, no real API calls). The production impl is
/// [`ProviderCaptionTranslator`].
#[async_trait]
pub trait CaptionTranslator: Send + Sync {
    /// Translates `source_text` (untrusted DATA) to `target_language`. Returns
    /// the provider/model-stamped result, or a redacted, key-free error string.
    async fn translate(
        &self,
        source_text: &str,
        source_language: Option<&str>,
        target_language: &str,
        model_id: &str,
    ) -> Result<TranslationResult, String>;
}

/// Production translator: owns the built provider client + the API key (read
/// once at session start from the keychain, never re-fetched per chunk) and runs
/// every translate through the provider layer.
struct ProviderCaptionTranslator {
    provider: Box<dyn TranslationProvider>,
    key: ApiKey,
}

#[async_trait]
impl CaptionTranslator for ProviderCaptionTranslator {
    async fn translate(
        &self,
        source_text: &str,
        source_language: Option<&str>,
        target_language: &str,
        model_id: &str,
    ) -> Result<TranslationResult, String> {
        let request = TranslationRequest {
            model_id: model_id.to_string(),
            source_language: source_language.map(str::to_string),
            target_language: target_language.to_string(),
            text: source_text.to_string(),
        };
        // Provider-layer errors are already redacted (no key material).
        self.provider
            .translate(&request, &self.key)
            .await
            .map_err(|e| e.to_string())
    }
}

/// Where the caption loop sends its outputs. Abstracted so tests collect
/// payloads in memory while production emits Tauri events.
pub trait CaptionSink: Send + Sync {
    /// A translated caption is ready.
    fn caption(&self, payload: AudioCaptionPayload);
    /// A chunk failed to transcribe or translate (non-fatal; the session
    /// continues). `message` is redacted DATA, never a secret or audio content.
    fn error(&self, message: String);
    /// The whisper model requires first-run download consent; the loop stops.
    fn consent_required(&self, disclosure: ConsentDisclosure);
}

/// Production sink: emits the `audio:caption` / `audio:error` /
/// `models:consent-required` events globally so the caption overlay (TASK-016)
/// receives them regardless of window label.
struct EventCaptionSink<R: Runtime> {
    app: AppHandle<R>,
}

impl<R: Runtime> CaptionSink for EventCaptionSink<R> {
    fn caption(&self, payload: AudioCaptionPayload) {
        let _ = self.app.emit(EVENT_AUDIO_CAPTION, payload);
    }
    fn error(&self, message: String) {
        // The message carries no audio content or key (redacted upstream).
        tracing::warn!(%message, "audio caption chunk failed");
        let _ = self
            .app
            .emit(EVENT_AUDIO_ERROR, AudioErrorPayload { message });
    }
    fn consent_required(&self, disclosure: ConsentDisclosure) {
        let _ = self.app.emit(EVENT_MODEL_CONSENT_REQUIRED, disclosure);
    }
}

/// Payload of [`EVENT_AUDIO_ERROR`]. `message` is untrusted DATA; the UI renders
/// its own localized copy.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioErrorPayload {
    pub message: String,
}

/// Builds the caption payload from a transcript + its translation. Pure and
/// I/O-free so the language/confidence/flag mapping is unit-tested without a
/// model or a provider.
///
/// Source language: when pinned (AC-01.4) the payload echoes the pin and marks
/// it non-auto; when auto (AC-01.3) it carries whisper's detected code. The
/// low-confidence flag is set when ANY segment falls below `threshold` (AC-01.7).
fn build_caption_payload(
    transcript: &Transcript,
    source_text: String,
    translation: TranslationResult,
    config: &CaptionConfig,
    sequence: u64,
    timestamp_ms: u64,
) -> AudioCaptionPayload {
    let segment_confidences: Vec<f32> = transcript.segments.iter().map(|s| s.confidence).collect();
    let low_confidence = transcript.has_low_confidence(config.low_confidence_threshold);
    AudioCaptionPayload {
        sequence,
        source_text,
        translated_text: translation.translated_text,
        source_language: transcript.language.code.clone(),
        source_language_auto_detected: transcript.language.auto_detected,
        target_language: config.target_language.clone(),
        provider: translation.provider_id.to_string(),
        model: translation.model_id,
        segment_confidences,
        low_confidence,
        timestamp_ms,
    }
}

/// The caption loop: drains speech chunks, transcribes each on a blocking thread,
/// translates the non-empty ones, and pushes captions to the sink. Runs until
/// the capture channel closes (session stop) or a consent refusal stops it.
///
/// HARDENING (AC-05.3): whisper inference runs on `tokio::task::spawn_blocking`,
/// so the CPU-bound native `full()` call never blocks a Tokio worker; the async
/// runtime stays responsive for the translate I/O and the stop signal.
///
/// AC-01.9 (belt-and-braces): an empty transcript (whisper returned no speech)
/// produces NO caption and NO translate call - even though VAD already gates
/// silence upstream.
pub async fn run_caption_loop(
    mut rx: mpsc::Receiver<AudioChunk>,
    stt: Arc<dyn SpeechToText>,
    translator: Arc<dyn CaptionTranslator>,
    sink: Arc<dyn CaptionSink>,
    config: CaptionConfig,
    started: Instant,
) {
    let options = config.transcribe_options();
    while let Some(chunk) = rx.recv().await {
        let sequence = chunk.sequence;
        let stt = Arc::clone(&stt);
        let opts = options.clone();

        // OFF the async runtime: native whisper inference on the blocking pool.
        let transcript =
            match tokio::task::spawn_blocking(move || stt.transcribe(&chunk, &opts)).await {
                Ok(Ok(transcript)) => transcript,
                Ok(Err(SttError::ConsentRequired(disclosure))) => {
                    // Cannot proceed without the model; ask once and stop the loop.
                    sink.consent_required(*disclosure);
                    break;
                }
                Ok(Err(err)) => {
                    sink.error(err.to_string());
                    continue;
                }
                Err(join) => {
                    sink.error(format!("stt task failed: {join}"));
                    continue;
                }
            };

        // AC-01.9: no speech -> no caption, no LLM call.
        if transcript.is_empty() {
            continue;
        }
        let source_text = transcript.text(" ");

        // Source language for the translate prompt: the pin (AC-01.4) or the
        // auto-detected code (AC-01.3).
        let source_language = match &config.source_language {
            Some(code) => Some(code.clone()),
            None => Some(transcript.language.code.clone()),
        };

        match translator
            .translate(
                &source_text,
                source_language.as_deref(),
                &config.target_language,
                &config.model_id,
            )
            .await
        {
            Ok(translation) => {
                let payload = build_caption_payload(
                    &transcript,
                    source_text,
                    translation,
                    &config,
                    sequence,
                    started.elapsed().as_millis() as u64,
                );
                sink.caption(payload);
            }
            Err(message) => sink.error(message),
        }
    }
}

/// A running audio-translation session's resources. Dropping it stops capture
/// (<= 1s, AC-01.10) and, via [`AudioSessionPipeline::stop`], releases the
/// whisper context.
struct ActiveSession {
    /// The capture session; dropping/stopping it halts WASAPI within <= 1s and
    /// closes the chunk channel, which ends the caption loop.
    capture: CaptureSession,
    /// The caption-loop task handle (ends when the channel closes).
    consumer: tauri::async_runtime::JoinHandle<()>,
    /// The whisper engine, kept so stop can unload the model (NFR-REL-02).
    stt: Arc<dyn SpeechToText>,
}

/// Managed Tauri state for the audio pipeline: the shared backends plus the (at
/// most one) active session. Cheap to construct; whisper loads lazily on the
/// first chunk and the session is `None` until [`start_audio_session`].
pub struct AudioSessionPipeline {
    keys: Arc<KeyStore>,
    gate: Arc<ModelGate>,
    /// The CURRENTLY SELECTED whisper model. A `Mutex` so Settings-time
    /// switching (TASK-026) can update it: the engine is built fresh from this
    /// value on every [`start_audio_session`], so a switch takes effect on the
    /// NEXT session with no separate "reload" path and no app restart.
    model: Mutex<WhisperModel>,
    model_dir: PathBuf,
    active: Mutex<Option<ActiveSession>>,
    /// The one-heavy-session-at-a-time coordinator (BR-04): starting an audio
    /// session drops any resident ORT OCR session, and stopping it drops the
    /// whisper context, so at most one heavy model set is resident.
    coordinator: Arc<HeavySessionCoordinator>,
}

impl AudioSessionPipeline {
    /// Wires the production backends: OS-keychain key store, the shared
    /// fail-closed consent `gate`, the initially-selected whisper model
    /// (hardware-recommended default, or the persisted Settings selection when
    /// still valid - `stt::catalog::resolve_selected_model`), and the shared
    /// heavy-session `coordinator` (BR-04).
    pub fn new_default(
        keys: Arc<KeyStore>,
        gate: Arc<ModelGate>,
        model: WhisperModel,
        model_dir: PathBuf,
        coordinator: Arc<HeavySessionCoordinator>,
    ) -> Self {
        Self {
            keys,
            gate,
            model: Mutex::new(model),
            model_dir,
            active: Mutex::new(None),
            coordinator,
        }
    }

    /// The currently selected model. Falls back to [`WhisperModel::BASE`] on a
    /// poisoned lock (a prior panic while holding it) rather than propagating
    /// the panic - defensive, mirrors the `active` lock's `unwrap_or` style
    /// elsewhere in this file; the critical section here never panics.
    fn current_model(&self) -> WhisperModel {
        self.model.lock().map(|g| *g).unwrap_or(WhisperModel::BASE)
    }

    /// `true` while an audio session is running - switching the model is
    /// refused during this window (TASK-026: never swap the engine under an
    /// active transcription loop).
    fn is_session_active(&self) -> bool {
        self.active.lock().map(|g| g.is_some()).unwrap_or(false)
    }

    /// Stops the active session (if any): halts capture within <= 1s (AC-01.10),
    /// lets the caption loop drain, and unloads the whisper model so the resident
    /// footprint falls back toward the idle baseline (NFR-PERF-03 / NFR-REL-02).
    /// Idempotent.
    pub fn stop(&self) {
        let session = self.active.lock().ok().and_then(|mut g| g.take());
        if let Some(session) = session {
            // Dropping the capture session signals stop and joins the capture
            // thread (bounded <= 1s), which closes the channel and ends the loop.
            drop(session.capture);
            session.consumer.abort();
            // Drop this session's whisper context directly (return-to-idle,
            // AC-05.4), then clear the coordinator's active marker (its registered
            // hook unloads the same context - idempotent). Doing both keeps the
            // release correct regardless of registration timing.
            session.stt.unload();
            self.coordinator.end(HeavySessionKind::Stt);
        }
    }
}

/// Resolves the provider + key for the request, failing closed with an
/// actionable error when no key is configured (AC-01.11). Factored out for unit
/// testing with an injected key store.
async fn resolve_translator(
    keys: &KeyStore,
    provider: ProviderId,
) -> Result<ProviderCaptionTranslator, AudioError> {
    let key = match keys.retrieve_key(provider).await {
        Ok(Some(key)) => key,
        Ok(None) => return Err(AudioError::NoProviderKey),
        Err(_) => return Err(AudioError::Keychain),
    };
    let client = build_provider(provider).map_err(|_| AudioError::Model)?;
    Ok(ProviderCaptionTranslator {
        provider: client,
        key,
    })
}

/// Maps a model-download failure to the command error, emitting the
/// consent-required event on a fail-closed refusal (mirrors region.rs).
fn map_download_error<R: Runtime>(app: &AppHandle<R>, err: DownloadError) -> AudioError {
    if let Some(disclosure) = err.consent_disclosure() {
        let _ = app.emit(EVENT_MODEL_CONSENT_REQUIRED, disclosure.clone());
        AudioError::ConsentRequired
    } else {
        tracing::error!(error = %err, "whisper model download failed");
        AudioError::Model
    }
}

/// Starts a live audio-translation session (AC-01.1). Validates the provider key
/// FIRST (AC-01.11: actionable error, no crash), ensures the whisper model is
/// present + SHA-256-verified through the fail-closed consent gate, then spawns
/// capture + the caption loop off the UI thread. Returns once the session is
/// running; captions stream via `audio:caption`.
#[tauri::command]
pub async fn start_audio_session(
    app: AppHandle,
    pipeline: State<'_, AudioSessionPipeline>,
    request: AudioSessionRequest,
) -> Result<(), AudioError> {
    // Reject a second start while one is running (single active session).
    if pipeline.is_session_active() {
        return Err(AudioError::AlreadyRunning);
    }

    let provider = request
        .provider
        .parse::<ProviderId>()
        .map_err(|_| AudioError::UnknownProvider)?;

    // AC-01.11: no key -> actionable error to Settings, no capture, no crash.
    let translator: Arc<dyn CaptionTranslator> =
        Arc::new(resolve_translator(&pipeline.keys, provider).await?);

    // The CURRENTLY SELECTED model (Settings-time switching, TASK-026): read
    // once so the whole session uses one consistent choice even if a switch
    // request races in (which is itself refused while a session is active).
    let model = pipeline.current_model();

    // Fail-closed, SHA-256-verified model availability (consent gate first).
    ensure_model_available(model, &pipeline.model_dir, &pipeline.gate)
        .await
        .map_err(|e| map_download_error(&app, e))?;

    // Build the whisper engine (required consent gate) and the capture source.
    let stt: Arc<dyn SpeechToText> = Arc::new(WhisperStt::new(
        model,
        pipeline.model_dir.clone(),
        Arc::clone(&pipeline.gate),
    ));
    // Start capture first: if the backend fails we return before marking a heavy
    // session active, so the coordinator's state never goes stale on a failed
    // start.
    let (capture, rx) = start_capture()?;

    // One-heavy-session-at-a-time (BR-04): register this session's whisper unload
    // hook, then start the STT session - dropping any resident ORT OCR session so
    // only one heavy model set is resident. The hook stays current for the
    // matching `stop -> end(Stt)`.
    let hook_stt = Arc::clone(&stt);
    pipeline
        .coordinator
        .register(HeavySessionKind::Stt, Arc::new(move || hook_stt.unload()));
    pipeline.coordinator.begin(HeavySessionKind::Stt);

    let config = CaptionConfig {
        source_language: normalize_language(request.source_language),
        target_language: normalize_target(request.target_language),
        model_id: request.model,
        low_confidence_threshold: LOW_CONFIDENCE_THRESHOLD,
    };
    let sink: Arc<dyn CaptionSink> = Arc::new(EventCaptionSink { app: app.clone() });
    let loop_stt = Arc::clone(&stt);
    let started = Instant::now();
    let consumer = tauri::async_runtime::spawn(async move {
        run_caption_loop(rx, loop_stt, translator, sink, config, started).await;
    });

    if let Ok(mut guard) = pipeline.active.lock() {
        *guard = Some(ActiveSession {
            capture,
            consumer,
            stt,
        });
    }
    Ok(())
}

/// Stops the active audio session (AC-01.10): capture halts within <= 1s and the
/// whisper model is released. Idempotent - safe to call with no active session.
#[tauri::command]
pub async fn stop_audio_session(
    pipeline: State<'_, AudioSessionPipeline>,
) -> Result<(), AudioError> {
    pipeline.stop();
    Ok(())
}

// ---------------------------------------------------------------------------
// Settings-time STT model switcher (FR-01, TASK-026,
// PRD-FR-01-stt-backend-options): extends the BR-08 first-run
// hardware-recommended default with a Settings picker across
// tiny/base/small/large-v3-turbo (+ large-v3 when CUDA-gated allowed). The
// download itself reuses the shared fail-closed consent gate and the
// `stt::download` fetch/verify path; only the disclosure shown is
// per-target-model (the exact file size of the tier the user picked), never
// the whole catalog.
// ---------------------------------------------------------------------------

/// One row of [`list_stt_models`] (Settings picker). Serializes to camelCase
/// for the WebView; never carries a secret.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SttModelInfo {
    /// Stable catalog id (`stt::catalog::CatalogEntry::id`).
    pub id: String,
    /// UI label (English fallback string; i18n owns the rendered copy).
    pub label: String,
    /// Approximate download size in bytes (shown before consent).
    pub approx_download_bytes: u64,
    /// Approximate resident RAM in bytes (BR-04 guardrail context).
    pub approx_ram_bytes: u64,
    /// Whether the model file is already present on disk (no download needed
    /// to switch to it).
    pub downloaded: bool,
    /// Whether the CURRENT hardware profile allows this tier (RAM floor / CUDA
    /// gate - FR-01.STT-2/STT-4). The UI hides/disables entries where `false`.
    pub allowed_by_probe: bool,
    /// `true` only for `large-v3` (FR-01.STT-2): the UI shows a "requires a
    /// CUDA GPU" note.
    pub requires_cuda: bool,
    /// `true` for the model the pipeline currently uses for new sessions.
    pub current: bool,
}

/// Errors from a Settings-time STT model switch request. Serializes to
/// `{ kind }` (never a secret); the UI maps `kind` to an i18n message.
#[derive(Debug, Clone, Copy, PartialEq, Eq, thiserror::Error)]
pub enum SttModelSwitchError {
    /// The requested id does not name a catalog entry.
    #[error("unknown STT model id")]
    UnknownModel,
    /// The current hardware profile does not allow this tier.
    #[error("model not allowed on this hardware")]
    NotAllowed,
    /// A live audio session is running; switching is refused mid-session.
    #[error("cannot switch the STT model while a session is active")]
    SessionActive,
    /// The model download failed (network/integrity/io) - see `stt::download`.
    #[error("STT model download failed")]
    Download,
    /// The selection could not be persisted to the settings store.
    #[error("could not persist the STT model selection")]
    Store,
}

impl SttModelSwitchError {
    fn kind(&self) -> &'static str {
        match self {
            SttModelSwitchError::UnknownModel => "unknownModel",
            SttModelSwitchError::NotAllowed => "notAllowed",
            SttModelSwitchError::SessionActive => "sessionActive",
            SttModelSwitchError::Download => "download",
            SttModelSwitchError::Store => "store",
        }
    }
}

impl Serialize for SttModelSwitchError {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        use serde::ser::SerializeStruct;
        let mut s = serializer.serialize_struct("SttModelSwitchError", 1)?;
        s.serialize_field("kind", self.kind())?;
        s.end()
    }
}

impl From<SwitchError> for SttModelSwitchError {
    fn from(err: SwitchError) -> Self {
        match err {
            SwitchError::UnknownModel => SttModelSwitchError::UnknownModel,
            SwitchError::NotAllowed => SttModelSwitchError::NotAllowed,
            SwitchError::SessionActive => SttModelSwitchError::SessionActive,
        }
    }
}

/// The outcome of [`request_stt_model_switch`], tagged by `status` for the
/// WebView.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum SttModelSwitchOutcome {
    /// The requested model was already selected - nothing changed.
    AlreadyCurrent,
    /// The model was already on disk: the switch is applied immediately, no
    /// download/consent needed.
    Switched,
    /// The model is not on disk: `disclosure` names the exact download size;
    /// the caller shows a confirmation dialog, then calls
    /// [`confirm_stt_model_switch`].
    ConsentRequired { disclosure: ConsentDisclosure },
}

/// Payload of [`EVENT_STT_MODEL_DOWNLOAD_PROGRESS`], emitted repeatedly while
/// [`confirm_stt_model_switch`] downloads. All fields are non-secret sizes.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SttModelDownloadProgressPayload {
    pub model_id: String,
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
}

/// Builds the [`SttModelInfo`] rows for every catalog tier against the CURRENT
/// hardware probe. Read-only; never triggers a download.
#[tauri::command]
pub fn list_stt_models(pipeline: State<'_, AudioSessionPipeline>) -> Vec<SttModelInfo> {
    let profile = probe_hardware();
    let current = pipeline.current_model();
    catalog::CATALOG
        .iter()
        .map(|entry| SttModelInfo {
            id: entry.id.to_string(),
            label: entry.label.to_string(),
            approx_download_bytes: entry.model.approx_download_bytes,
            approx_ram_bytes: entry.model.approx_ram_bytes,
            downloaded: entry.model.path_in(&pipeline.model_dir).exists(),
            allowed_by_probe: catalog::is_allowed(entry, &profile),
            requires_cuda: entry.requires_cuda,
            current: entry.model.size == current.size,
        })
        .collect()
}

/// Validates a switch request against the catalog + current hardware profile
/// + active-session state, applying it immediately when no download is
/// needed. Returns [`SttModelSwitchOutcome::ConsentRequired`] (with the exact
/// per-model download size) when a fetch is required - the caller must then
/// call [`confirm_stt_model_switch`] after the user confirms.
#[tauri::command]
pub fn request_stt_model_switch(
    app: AppHandle,
    pipeline: State<'_, AudioSessionPipeline>,
    model_id: String,
) -> Result<SttModelSwitchOutcome, SttModelSwitchError> {
    let entry = catalog::entry_for_id(&model_id).ok_or(SttModelSwitchError::UnknownModel)?;
    let profile = probe_hardware();
    if !catalog::is_allowed(entry, &profile) {
        return Err(SttModelSwitchError::NotAllowed);
    }

    let already_selected = entry.model.size == pipeline.current_model().size;
    let file_present = entry.model.path_in(&pipeline.model_dir).exists();
    let decision = decide_switch(already_selected, file_present, pipeline.is_session_active())?;

    match decision {
        SwitchDecision::AlreadyCurrent => Ok(SttModelSwitchOutcome::AlreadyCurrent),
        SwitchDecision::Switched => {
            apply_model_switch(&app, &pipeline, &model_id, entry.model)?;
            Ok(SttModelSwitchOutcome::Switched)
        }
        SwitchDecision::ConsentRequired => {
            let disclosure =
                crate::stt::whisper_model_set_descriptor(entry.model, pipeline.model_dir.clone())
                    .disclosure();
            Ok(SttModelSwitchOutcome::ConsentRequired { disclosure })
        }
    }
}

/// Downloads the target model (after the user confirmed the
/// [`SttModelSwitchOutcome::ConsentRequired`] disclosure), reporting progress
/// via [`EVENT_STT_MODEL_DOWNLOAD_PROGRESS`], then applies the switch. Grants
/// the shared whisper-download consent flag (idempotent) - this extends the
/// SAME BR-08 fail-closed gate the first-run download uses, rather than a
/// second one, per PRD-FR-01-stt-backend-options section 4 FR-01.STT-3.
#[tauri::command]
pub async fn confirm_stt_model_switch(
    app: AppHandle,
    pipeline: State<'_, AudioSessionPipeline>,
    model_id: String,
) -> Result<(), SttModelSwitchError> {
    let entry = catalog::entry_for_id(&model_id).ok_or(SttModelSwitchError::UnknownModel)?;
    let profile = probe_hardware();
    if !catalog::is_allowed(entry, &profile) {
        return Err(SttModelSwitchError::NotAllowed);
    }
    if pipeline.is_session_active() {
        return Err(SttModelSwitchError::SessionActive);
    }

    pipeline
        .gate
        .grant(WHISPER_MODEL_SET_ID)
        .map_err(|_| SttModelSwitchError::Download)?;

    let model = entry.model;
    let dir = pipeline.model_dir.clone();
    let progress_app = app.clone();
    let progress_id = model_id.clone();
    ensure_model_available_with_progress(model, &dir, &pipeline.gate, move |downloaded, total| {
        let _ = progress_app.emit(
            EVENT_STT_MODEL_DOWNLOAD_PROGRESS,
            SttModelDownloadProgressPayload {
                model_id: progress_id.clone(),
                downloaded_bytes: downloaded,
                total_bytes: total,
            },
        );
    })
    .await
    .map_err(|_| SttModelSwitchError::Download)?;

    apply_model_switch(&app, &pipeline, &model_id, model)
}

/// Persists `model_id` to the settings store and swaps the pipeline's current
/// model. Called once the target model is confirmed present on disk (either
/// it already was, or [`confirm_stt_model_switch`] just fetched it).
fn apply_model_switch(
    app: &AppHandle,
    pipeline: &AudioSessionPipeline,
    model_id: &str,
    model: WhisperModel,
) -> Result<(), SttModelSwitchError> {
    let store = app
        .store(SETTINGS_STORE_FILE)
        .map_err(|_| SttModelSwitchError::Store)?;
    store.set(
        STT_MODEL_STORE_KEY,
        serde_json::Value::String(model_id.to_string()),
    );
    store.save().map_err(|_| SttModelSwitchError::Store)?;

    if let Ok(mut guard) = pipeline.model.lock() {
        *guard = model;
    }
    Ok(())
}

/// Builds the platform capture source + session. Windows-first (WASAPI
/// loopback); other platforms are Phase-4 ports.
#[cfg(windows)]
fn start_capture() -> Result<(CaptureSession, mpsc::Receiver<AudioChunk>), AudioError> {
    let source = crate::audio::WindowsLoopbackSource::new().map_err(|e| {
        tracing::error!(error = %e, "WASAPI loopback capture failed to start");
        AudioError::Capture
    })?;
    Ok(CaptureSession::start(source))
}

#[cfg(not(windows))]
fn start_capture() -> Result<(CaptureSession, mpsc::Receiver<AudioChunk>), AudioError> {
    // Capture backends for macOS/Linux land in Phase 4 (behind the same trait).
    Err(AudioError::Capture)
}

/// Normalizes the pinned source language: empty / `"auto"` -> auto-detect
/// (`None`); otherwise a lowercased pinned code (AC-01.4). Untrusted IPC input
/// treated as DATA.
fn normalize_language(raw: Option<String>) -> Option<String> {
    let trimmed = raw.unwrap_or_default();
    let trimmed = trimmed.trim();
    if trimmed.is_empty() || trimmed.eq_ignore_ascii_case("auto") {
        None
    } else {
        Some(trimmed.to_ascii_lowercase())
    }
}

/// Normalizes the target language: empty / absent -> default `vi` (AC-01.5).
fn normalize_target(raw: Option<String>) -> String {
    let trimmed = raw.unwrap_or_default();
    let trimmed = trimmed.trim();
    if trimmed.is_empty() {
        DEFAULT_TARGET_LANGUAGE.to_string()
    } else {
        trimmed.to_ascii_lowercase()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::stt::{DetectedLanguage, TranscriptSegment};
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::time::Duration;

    fn transcript(segments: Vec<(&str, f32)>, code: &str, auto: bool) -> Transcript {
        Transcript {
            segments: segments
                .into_iter()
                .map(|(text, confidence)| TranscriptSegment {
                    text: text.to_string(),
                    confidence,
                    t0_ms: 0,
                    t1_ms: 0,
                })
                .collect(),
            language: DetectedLanguage {
                code: code.to_string(),
                auto_detected: auto,
            },
        }
    }

    fn config(source: Option<&str>, target: &str) -> CaptionConfig {
        CaptionConfig {
            source_language: source.map(str::to_string),
            target_language: target.to_string(),
            model_id: "test-model".into(),
            low_confidence_threshold: 0.6,
        }
    }

    fn translation(text: &str) -> TranslationResult {
        TranslationResult {
            provider_id: ProviderId::Gemini,
            model_id: "test-model".into(),
            translated_text: text.into(),
        }
    }

    #[test]
    fn payload_uses_auto_detected_language_and_flags_low_confidence() {
        // AC-01.3 + AC-01.7: auto-detected code echoed, and a sub-threshold
        // segment sets the low-confidence flag.
        let t = transcript(vec![("hello", 0.95), ("world", 0.40)], "en", true);
        let cfg = config(None, "vi");
        let payload =
            build_caption_payload(&t, t.text(" "), translation("xin chao"), &cfg, 3, 1500);
        assert_eq!(payload.sequence, 3);
        assert_eq!(payload.source_text, "hello world");
        assert_eq!(payload.translated_text, "xin chao");
        assert_eq!(payload.source_language, "en");
        assert!(payload.source_language_auto_detected);
        assert_eq!(payload.target_language, "vi");
        assert_eq!(payload.provider, "gemini");
        assert_eq!(payload.segment_confidences, vec![0.95, 0.40]);
        assert!(payload.low_confidence);
        assert_eq!(payload.timestamp_ms, 1500);
    }

    #[test]
    fn payload_high_confidence_is_not_flagged() {
        let t = transcript(vec![("clear speech", 0.92)], "ja", true);
        let cfg = config(None, "vi");
        let payload = build_caption_payload(&t, t.text(" "), translation("x"), &cfg, 0, 0);
        assert!(!payload.low_confidence);
        assert_eq!(payload.segment_confidences, vec![0.92]);
    }

    #[test]
    fn pinned_source_language_sets_the_transcribe_option() {
        // AC-01.4: a pinned language yields pinned transcribe options (no auto).
        let cfg = config(Some("ja"), "vi");
        assert_eq!(
            cfg.transcribe_options(),
            TranscribeOptions::pinned("ja".to_string())
        );
        // Auto when unpinned (AC-01.3).
        assert_eq!(
            config(None, "vi").transcribe_options(),
            TranscribeOptions::auto()
        );
    }

    #[test]
    fn normalize_language_maps_auto_and_pins() {
        assert_eq!(normalize_language(None), None);
        assert_eq!(normalize_language(Some("".into())), None);
        assert_eq!(normalize_language(Some("  ".into())), None);
        assert_eq!(normalize_language(Some("AUTO".into())), None);
        assert_eq!(normalize_language(Some("JA".into())), Some("ja".into()));
    }

    #[test]
    fn normalize_target_defaults_to_vi() {
        assert_eq!(normalize_target(None), "vi");
        assert_eq!(normalize_target(Some("".into())), "vi");
        assert_eq!(normalize_target(Some(" EN ".into())), "en");
    }

    #[test]
    fn caption_payload_serializes_to_camel_case() {
        // 0.75 is exactly representable in f32 (and above the 0.6 flag
        // threshold), so the JSON number compares clean and stays high-confidence.
        let t = transcript(vec![("hi", 0.75)], "en", true);
        let cfg = config(None, "vi");
        let payload = build_caption_payload(&t, t.text(" "), translation("chao"), &cfg, 1, 10);
        let json = serde_json::to_value(&payload).unwrap();
        assert_eq!(json["sourceText"], "hi");
        assert_eq!(json["translatedText"], "chao");
        assert_eq!(json["sourceLanguage"], "en");
        assert_eq!(json["sourceLanguageAutoDetected"], true);
        assert_eq!(json["targetLanguage"], "vi");
        assert_eq!(json["lowConfidence"], false);
        assert_eq!(json["segmentConfidences"][0], 0.75);
    }

    #[test]
    fn audio_error_serializes_only_the_kind_tag() {
        assert_eq!(
            serde_json::to_value(AudioError::NoProviderKey).unwrap(),
            serde_json::json!({ "kind": "noProviderKey" })
        );
        assert_eq!(EVENT_AUDIO_CAPTION, "audio:caption");
        assert_eq!(EVENT_AUDIO_ERROR, "audio:error");
    }

    /// A mock STT whose `transcribe` BLOCKS (sleeps) to model the CPU-bound
    /// native whisper call, and returns a scripted transcript. Never real audio.
    struct BlockingMockStt {
        block: Duration,
        segments: Vec<(&'static str, f32)>,
        code: &'static str,
    }

    impl SpeechToText for BlockingMockStt {
        fn id(&self) -> &'static str {
            "blocking-mock-stt"
        }
        fn transcribe(
            &self,
            _chunk: &AudioChunk,
            _options: &TranscribeOptions,
        ) -> Result<Transcript, SttError> {
            std::thread::sleep(self.block);
            Ok(transcript(self.segments.clone(), self.code, true))
        }
        fn is_loaded(&self) -> bool {
            true
        }
        fn unload(&self) {}
    }

    /// A mock STT that always returns an empty transcript (whisper found no
    /// speech) - drives the AC-01.9 belt-and-braces path.
    struct EmptyStt;
    impl SpeechToText for EmptyStt {
        fn id(&self) -> &'static str {
            "empty-stt"
        }
        fn transcribe(
            &self,
            _chunk: &AudioChunk,
            _options: &TranscribeOptions,
        ) -> Result<Transcript, SttError> {
            Ok(transcript(vec![], "en", true))
        }
        fn is_loaded(&self) -> bool {
            true
        }
        fn unload(&self) {}
    }

    /// An instant, no-network translator that records whether it was called and
    /// echoes a canned translation (testing.md: providers mocked).
    struct StubTranslator {
        calls: AtomicUsize,
    }
    #[async_trait]
    impl CaptionTranslator for StubTranslator {
        async fn translate(
            &self,
            source_text: &str,
            _source_language: Option<&str>,
            _target_language: &str,
            _model_id: &str,
        ) -> Result<TranslationResult, String> {
            self.calls.fetch_add(1, Ordering::SeqCst);
            Ok(translation(&format!("[t]{source_text}")))
        }
    }

    /// A sink that collects captions/errors in memory for assertions.
    #[derive(Default)]
    struct CollectingSink {
        captions: Mutex<Vec<AudioCaptionPayload>>,
        errors: Mutex<Vec<String>>,
        consents: Mutex<usize>,
    }
    impl CaptionSink for CollectingSink {
        fn caption(&self, payload: AudioCaptionPayload) {
            self.captions.lock().unwrap().push(payload);
        }
        fn error(&self, message: String) {
            self.errors.lock().unwrap().push(message);
        }
        fn consent_required(&self, _disclosure: ConsentDisclosure) {
            *self.consents.lock().unwrap() += 1;
        }
    }

    fn chunk(seq: u64) -> AudioChunk {
        AudioChunk {
            samples: vec![0.1; 16_000],
            sample_rate: 16_000,
            sequence: seq,
        }
    }

    #[tokio::test]
    async fn silence_transcript_produces_no_caption_and_no_translate() {
        // AC-01.9: an empty transcript yields no caption and no LLM call.
        let (tx, rx) = mpsc::channel(4);
        tx.send(chunk(0)).await.unwrap();
        drop(tx);

        let stt: Arc<dyn SpeechToText> = Arc::new(EmptyStt);
        let translator = Arc::new(StubTranslator {
            calls: AtomicUsize::new(0),
        });
        let sink = Arc::new(CollectingSink::default());
        run_caption_loop(
            rx,
            stt,
            Arc::clone(&translator) as Arc<dyn CaptionTranslator>,
            Arc::clone(&sink) as Arc<dyn CaptionSink>,
            config(None, "vi"),
            Instant::now(),
        )
        .await;

        assert!(sink.captions.lock().unwrap().is_empty());
        assert_eq!(
            translator.calls.load(Ordering::SeqCst),
            0,
            "no LLM call on silence"
        );
    }

    #[tokio::test]
    async fn speech_chunks_produce_captions_in_order() {
        let (tx, rx) = mpsc::channel(4);
        for i in 0..3 {
            tx.send(chunk(i)).await.unwrap();
        }
        drop(tx);

        let stt: Arc<dyn SpeechToText> = Arc::new(BlockingMockStt {
            block: Duration::from_millis(0),
            segments: vec![("hello", 0.9)],
            code: "en",
        });
        let translator = Arc::new(StubTranslator {
            calls: AtomicUsize::new(0),
        });
        let sink = Arc::new(CollectingSink::default());
        run_caption_loop(
            rx,
            stt,
            Arc::clone(&translator) as Arc<dyn CaptionTranslator>,
            Arc::clone(&sink) as Arc<dyn CaptionSink>,
            config(None, "vi"),
            Instant::now(),
        )
        .await;

        let captions = sink.captions.lock().unwrap();
        assert_eq!(captions.len(), 3);
        for (i, c) in captions.iter().enumerate() {
            assert_eq!(c.sequence, i as u64);
            assert_eq!(c.source_text, "hello");
            assert_eq!(c.translated_text, "[t]hello");
        }
    }

    /// HARDENING (AC-05.3): whisper inference must run on `spawn_blocking`, never
    /// a Tokio worker. On a single-threaded (current-thread) runtime, a blocking
    /// transcribe run directly on the worker would stall ALL async tasks. We run
    /// the caption loop (transcribe blocks 150ms/chunk) concurrently with a timer
    /// task ticking every 10ms; if inference blocked the runtime the timer could
    /// not advance. Asserting the timer kept ticking proves inference is off the
    /// async worker.
    #[tokio::test]
    async fn transcription_runs_off_the_async_worker() {
        let (tx, rx) = mpsc::channel(4);
        for i in 0..2 {
            tx.send(chunk(i)).await.unwrap();
        }
        drop(tx);

        let stt: Arc<dyn SpeechToText> = Arc::new(BlockingMockStt {
            block: Duration::from_millis(150),
            segments: vec![("hi", 0.9)],
            code: "en",
        });
        let translator = Arc::new(StubTranslator {
            calls: AtomicUsize::new(0),
        });
        let sink = Arc::new(CollectingSink::default());

        let ticks = Arc::new(AtomicUsize::new(0));
        let ticks_task = Arc::clone(&ticks);
        let timer = tokio::spawn(async move {
            for _ in 0..60 {
                tokio::time::sleep(Duration::from_millis(10)).await;
                ticks_task.fetch_add(1, Ordering::SeqCst);
            }
        });

        run_caption_loop(
            rx,
            stt,
            Arc::clone(&translator) as Arc<dyn CaptionTranslator>,
            Arc::clone(&sink) as Arc<dyn CaptionSink>,
            config(None, "vi"),
            Instant::now(),
        )
        .await;

        // The loop spent ~300ms in blocking transcribes; a runtime that was NOT
        // blocked let the 10ms timer tick many times during that window.
        let observed = ticks.load(Ordering::SeqCst);
        assert!(
            observed >= 10,
            "async runtime appears blocked by inference: only {observed} timer ticks"
        );
        assert_eq!(sink.captions.lock().unwrap().len(), 2);
        timer.abort();
    }

    #[tokio::test]
    async fn transcribe_error_is_surfaced_and_the_loop_continues() {
        struct FlakyStt {
            calls: AtomicUsize,
        }
        impl SpeechToText for FlakyStt {
            fn id(&self) -> &'static str {
                "flaky-stt"
            }
            fn transcribe(
                &self,
                _chunk: &AudioChunk,
                _options: &TranscribeOptions,
            ) -> Result<Transcript, SttError> {
                // First chunk errors, the rest succeed.
                if self.calls.fetch_add(1, Ordering::SeqCst) == 0 {
                    Err(SttError::Inference("boom".into()))
                } else {
                    Ok(transcript(vec![("ok", 0.9)], "en", true))
                }
            }
            fn is_loaded(&self) -> bool {
                true
            }
            fn unload(&self) {}
        }

        let (tx, rx) = mpsc::channel(4);
        tx.send(chunk(0)).await.unwrap();
        tx.send(chunk(1)).await.unwrap();
        drop(tx);

        let stt: Arc<dyn SpeechToText> = Arc::new(FlakyStt {
            calls: AtomicUsize::new(0),
        });
        let translator = Arc::new(StubTranslator {
            calls: AtomicUsize::new(0),
        });
        let sink = Arc::new(CollectingSink::default());
        run_caption_loop(
            rx,
            stt,
            Arc::clone(&translator) as Arc<dyn CaptionTranslator>,
            Arc::clone(&sink) as Arc<dyn CaptionSink>,
            config(None, "vi"),
            Instant::now(),
        )
        .await;

        // The error was surfaced and the SECOND chunk still produced a caption.
        assert_eq!(sink.errors.lock().unwrap().len(), 1);
        assert_eq!(sink.captions.lock().unwrap().len(), 1);
    }

    #[tokio::test]
    async fn consent_refusal_stops_the_loop_and_asks_once() {
        struct ConsentStt;
        impl SpeechToText for ConsentStt {
            fn id(&self) -> &'static str {
                "consent-stt"
            }
            fn transcribe(
                &self,
                _chunk: &AudioChunk,
                _options: &TranscribeOptions,
            ) -> Result<Transcript, SttError> {
                Err(SttError::ConsentRequired(Box::new(ConsentDisclosure {
                    model_set_id: "whisper-ggml".into(),
                    display_name: "whisper".into(),
                    host_name: "Hugging Face".into(),
                    host_domain: "huggingface.co".into(),
                    artifacts: vec![],
                    total_approx_size_bytes: 0,
                    destination: "/cache".into(),
                })))
            }
            fn is_loaded(&self) -> bool {
                false
            }
            fn unload(&self) {}
        }

        let (tx, rx) = mpsc::channel(4);
        tx.send(chunk(0)).await.unwrap();
        tx.send(chunk(1)).await.unwrap();
        drop(tx);

        let stt: Arc<dyn SpeechToText> = Arc::new(ConsentStt);
        let translator = Arc::new(StubTranslator {
            calls: AtomicUsize::new(0),
        });
        let sink = Arc::new(CollectingSink::default());
        run_caption_loop(
            rx,
            stt,
            Arc::clone(&translator) as Arc<dyn CaptionTranslator>,
            Arc::clone(&sink) as Arc<dyn CaptionSink>,
            config(None, "vi"),
            Instant::now(),
        )
        .await;

        // Asked for consent exactly once and stopped (no captions, no LLM call).
        assert_eq!(*sink.consents.lock().unwrap(), 1);
        assert!(sink.captions.lock().unwrap().is_empty());
        assert_eq!(translator.calls.load(Ordering::SeqCst), 0);
    }

    #[tokio::test]
    async fn resolve_translator_reports_no_key_actionably() {
        // AC-01.11: with no key configured, session start fails with an
        // actionable NoProviderKey - no crash, no capture.
        use crate::keys::{KeyBackend, KeyStoreError};

        struct EmptyBackend;
        impl KeyBackend for EmptyBackend {
            fn set_secret(&self, _: &str, _: &str, _: &str) -> Result<(), KeyStoreError> {
                Ok(())
            }
            fn get_secret(&self, _: &str, _: &str) -> Result<Option<String>, KeyStoreError> {
                Ok(None)
            }
            fn delete_secret(&self, _: &str, _: &str) -> Result<(), KeyStoreError> {
                Ok(())
            }
        }

        let store = KeyStore::with_backend(Arc::new(EmptyBackend));
        let err = match resolve_translator(&store, ProviderId::Gemini).await {
            Err(e) => e,
            Ok(_) => panic!("expected NoProviderKey with an empty keychain"),
        };
        assert!(matches!(err, AudioError::NoProviderKey));
        assert_eq!(err.kind(), "noProviderKey");
    }
}
