//! System-audio capture pipeline (WASAPI loopback), VAD and chunking (FR-01).
//!
//! Layout mirrors the OCR/capture pipelines: a platform-agnostic trait
//! ([`AudioSource`]) with a Windows-first impl, plus pure, unit-testable stages
//! (VAD, chunking) wired together by a session that runs OFF the UI thread
//! (AC-05.3) and streams speech chunks to the STT stage (TASK-014).
//!
//! Privacy invariant (AC-01.6 / BR-01): every stage keeps audio in memory only;
//! nothing writes raw audio to disk or into a network payload. Only the
//! transcribed TEXT produced downstream ever leaves this process.

pub mod chunk;
pub mod session;
pub mod source;
pub mod vad;

#[cfg(windows)]
pub mod wasapi;

pub use chunk::{ChunkConfig, SpeechChunker};
pub use session::CaptureSession;
pub use source::{downmix_to_mono, AudioChunk, AudioFormat, AudioSource, CaptureError};
pub use vad::{frame_rms, Vad, VadConfig};

#[cfg(windows)]
pub use wasapi::WindowsLoopbackSource;
