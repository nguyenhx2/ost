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

pub mod download;
pub mod engine;
pub mod hardware;
pub mod model;
pub mod whisper;

pub use download::{ensure_model_available, verify_model_bytes, DownloadError};
pub use engine::{
    mean_token_confidence, DetectedLanguage, SpeechToText, SttError, TranscribeOptions, Transcript,
    TranscriptSegment,
};
pub use hardware::{probe_hardware, recommend_model, HardwareProfile};
pub use model::{
    resolve_whisper_model_dir, whisper_model_set_descriptor, WhisperModel, WhisperModelSize,
    HUGGING_FACE, WHISPER_MODEL_SET_ID,
};
pub use whisper::{resample_to_16k, WhisperStt, WHISPER_SAMPLE_RATE};
