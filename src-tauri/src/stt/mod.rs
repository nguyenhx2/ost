//! Local speech-to-text via whisper.cpp (`whisper-rs`) behind the
//! [`SpeechToText`] trait (FR-01, ADR-002).
//!
//! Layout mirrors the OCR pipeline: a platform/engine-agnostic trait
//! ([`engine`]) with a whisper-first impl ([`whisper`]), the whisper model
//! registry + first-run consent descriptor ([`model`], routed through the SHARED
//! `crate::models` gate - never a second gate), and the hardware probe ->
//! model-size recommendation ([`hardware`], BR-08).
//!
//! Privacy invariant (AC-01.6 / BR-01): audio stays in RAM (resampled in-memory
//! to 16 kHz); only the transcribed TEXT leaves this module. STT is local, so
//! audio never reaches the network (ADR-002).

// Settings-time model catalog + hardware gating (TASK-026, FR-01.STT-1..5).
pub mod catalog;
pub mod download;
pub mod engine;
pub mod hardware;
pub mod model;
// Pure switch-request decision logic (TASK-026), reused by the IPC command
// layer (`shell::audio_session`).
pub mod switch;
pub mod whisper;

pub use catalog::{
    allowed_entries, entry_for_id, is_allowed as catalog_is_allowed, resolve_selected_model,
    CatalogEntry, CATALOG, DEFAULT_ID as CATALOG_DEFAULT_ID,
};
pub use download::{
    ensure_model_available, ensure_model_available_with_progress,
    ensure_model_available_with_progress_and_cancel, verify_model_bytes, CancelFlag, DownloadError,
};
pub use engine::{
    mean_token_confidence, DetectedLanguage, SpeechToText, SttError, TranscribeOptions, Transcript,
    TranscriptSegment,
};
pub use hardware::{probe_hardware, recommend_model, HardwareProfile};
pub use model::{
    resolve_whisper_model_dir, whisper_model_set_descriptor, WhisperModel, WhisperModelSize,
    HUGGING_FACE, WHISPER_MODEL_SET_ID,
};
pub use switch::{decide_switch, SwitchDecision, SwitchError};
pub use whisper::{resample_to_16k, WhisperStt, WHISPER_SAMPLE_RATE};
