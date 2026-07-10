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
use tokio::sync::mpsc;

use crate::audio::{AudioChunk, CaptureSession};
use crate::keys::{ApiKey, KeyStore};
use crate::models::{ConsentDisclosure, ModelGate};
use crate::providers::{
    build_provider, ProviderId, TranslationProvider, TranslationRequest, TranslationResult,
};
use crate::stt::{
    ensure_model_available, DownloadError, SpeechToText, SttError, TranscribeOptions, Transcript,
    WhisperModel, WhisperStt,
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
    model: WhisperModel,
    model_dir: PathBuf,
    active: Mutex<Option<ActiveSession>>,
}

impl AudioSessionPipeline {
    /// Wires the production backends: OS-keychain key store, the shared
    /// fail-closed consent `gate`, and the hardware-recommended whisper model.
    pub fn new_default(
        keys: Arc<KeyStore>,
        gate: Arc<ModelGate>,
        model: WhisperModel,
        model_dir: PathBuf,
    ) -> Self {
        Self {
            keys,
            gate,
            model,
            model_dir,
            active: Mutex::new(None),
        }
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
            session.stt.unload();
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
    if pipeline.active.lock().map(|g| g.is_some()).unwrap_or(false) {
        return Err(AudioError::AlreadyRunning);
    }

    let provider = request
        .provider
        .parse::<ProviderId>()
        .map_err(|_| AudioError::UnknownProvider)?;

    // AC-01.11: no key -> actionable error to Settings, no capture, no crash.
    let translator: Arc<dyn CaptionTranslator> =
        Arc::new(resolve_translator(&pipeline.keys, provider).await?);

    // Fail-closed, SHA-256-verified model availability (consent gate first).
    ensure_model_available(pipeline.model, &pipeline.model_dir, &pipeline.gate)
        .await
        .map_err(|e| map_download_error(&app, e))?;

    // Build the whisper engine (required consent gate) and the capture source.
    let stt: Arc<dyn SpeechToText> = Arc::new(WhisperStt::new(
        pipeline.model,
        pipeline.model_dir.clone(),
        Arc::clone(&pipeline.gate),
    ));
    let (capture, rx) = start_capture()?;

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
