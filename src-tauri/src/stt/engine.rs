//! The [`SpeechToText`] trait and its result types (FR-01, ADR-002).
//!
//! This is the single surface the capture -> VAD -> chunk -> STT pipeline uses
//! to turn one [`AudioChunk`] into text. Engine/platform-specific impls (whisper
//! via `whisper-rs` first; a cloud-realtime path may follow under a new ADR) live
//! behind this trait so the Phase-4 ports swap impls, not call sites.
//!
//! HARD PRIVACY INVARIANT (AC-01.6 / BR-01): input audio stays in RAM; only the
//! transcribed TEXT in a [`Transcript`] ever leaves this process. STT is local
//! (ADR-002) so audio never reaches the network.
//!
//! Transcribed text is untrusted DATA: it flows downstream (translate stage) as
//! data and is never interpreted as instructions (agent-guardrails.md section 2).

use crate::audio::AudioChunk;

/// Errors surfaced by any [`SpeechToText`] implementation. Display strings never
/// carry audio samples or transcribed content - only model ids/paths/reasons.
#[derive(Debug, thiserror::Error)]
pub enum SttError {
    /// The engine could not load its model (missing file, corrupt model, or
    /// whisper context init failure). The lazy-init failure class (NFR-REL-02).
    #[error("STT model load failed: {0}")]
    ModelLoad(String),

    /// Transcription failed on otherwise-valid audio (whisper `full` error).
    #[error("STT inference failed: {0}")]
    Inference(String),

    /// The input chunk was rejected (empty, or an unusable sample rate).
    #[error("invalid STT input: {0}")]
    InvalidInput(String),

    /// The engine needs to download a model but first-run consent has not been
    /// granted (fail-closed, security-privacy.md). Carries the disclosure so the
    /// pipeline can ask the user; transcription is refused until consent is given.
    #[error("STT model download requires consent: {}", .0.model_set_id)]
    ConsentRequired(Box<crate::models::ConsentDisclosure>),
}

/// The detected (or pinned) source language of a [`Transcript`] (AC-01.3).
///
/// whisper auto-detects the language of each chunk; the pipeline surfaces
/// `code` on the overlay. When the user pins a language in Settings (AC-01.4)
/// `auto_detected` is `false` and `code` is the pinned value.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DetectedLanguage {
    /// ISO 639-1 code whisper reports (e.g. "en", "ja", "vi"). `"auto"` only if
    /// detection was requested but the backend could not resolve a code.
    pub code: String,
    /// `true` when whisper auto-detected this language, `false` when the user
    /// pinned it in Settings (the pipeline echoes the pin straight through).
    pub auto_detected: bool,
}

/// One transcribed speech segment with its confidence and timing.
///
/// `confidence` is the mean per-token probability whisper assigns across the
/// segment, in `[0.0, 1.0]`. It drives the low-confidence flag (AC-01.7): a
/// segment below the UI threshold is marked uncertain rather than shown as a
/// silent best-guess (human-in-the-loop.md).
#[derive(Debug, Clone, PartialEq)]
pub struct TranscriptSegment {
    /// The recognized text (untrusted DATA).
    pub text: String,
    /// Mean per-token probability in `[0.0, 1.0]`.
    pub confidence: f32,
    /// Segment start offset within the chunk, in milliseconds.
    pub t0_ms: i64,
    /// Segment end offset within the chunk, in milliseconds.
    pub t1_ms: i64,
}

impl TranscriptSegment {
    /// Whether this segment falls below `threshold` confidence - the signal the
    /// UI uses to flag it as low-confidence (AC-01.7 / BR-05).
    #[must_use]
    pub fn is_low_confidence(&self, threshold: f32) -> bool {
        self.confidence < threshold
    }
}

/// The full transcription result for one [`AudioChunk`].
#[derive(Debug, Clone, PartialEq)]
pub struct Transcript {
    /// Recognized segments in order. Empty when the chunk carried no speech
    /// (whisper returned no segments) - AC-01.9 relies on VAD upstream, but a
    /// belt-and-braces empty result here also produces no caption/LLM call.
    pub segments: Vec<TranscriptSegment>,
    /// The detected or pinned source language (AC-01.3 / AC-01.4).
    pub language: DetectedLanguage,
}

impl Transcript {
    /// The segments' text joined by `separator` (what the translate stage
    /// receives as its source text).
    #[must_use]
    pub fn text(&self, separator: &str) -> String {
        self.segments
            .iter()
            .map(|s| s.text.trim())
            .filter(|s| !s.is_empty())
            .collect::<Vec<_>>()
            .join(separator)
    }

    /// Whether any segment falls below `threshold` confidence (AC-01.7).
    #[must_use]
    pub fn has_low_confidence(&self, threshold: f32) -> bool {
        self.segments.iter().any(|s| s.is_low_confidence(threshold))
    }

    /// Whether the transcript carries no usable speech text.
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.text(" ").is_empty()
    }
}

/// Per-transcription options the pipeline (TASK-015) passes each call.
///
/// The default is whisper auto-detect (AC-01.3). Setting `language` pins the
/// source language (AC-01.4): whisper then decodes in that language and skips
/// detection. Kept as call options (not engine state) so the trait stays
/// stateless and the pinned/auto choice is explicit at each call site.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct TranscribeOptions {
    /// `Some(code)` pins the ISO 639-1 source language; `None` auto-detects.
    pub language: Option<String>,
}

impl TranscribeOptions {
    /// Auto-detect the source language (AC-01.3).
    #[must_use]
    pub fn auto() -> Self {
        Self { language: None }
    }

    /// Pin the source language to `code` (AC-01.4).
    #[must_use]
    pub fn pinned(code: impl Into<String>) -> Self {
        Self {
            language: Some(code.into()),
        }
    }
}

/// One speech-to-text backend. Implementations own their model lifecycle and
/// MUST load the (heavy) whisper model lazily - never at app start (NFR-REL-02)
/// - and release it on session end via [`SpeechToText::unload`].
///
/// `transcribe` is synchronous and CPU-bound: the pipeline runs it on a blocking
/// task (`tokio::task::spawn_blocking`) so it never blocks an async runtime
/// (coding-standards.md: no blocking calls in async contexts).
pub trait SpeechToText: Send + Sync {
    /// A short, stable identifier for the backend (telemetry/UI badge).
    fn id(&self) -> &'static str;

    /// Transcribes one audio chunk. Resamples to whisper's 16 kHz internally;
    /// the caller hands raw capture-rate mono samples in the chunk.
    fn transcribe(
        &self,
        chunk: &AudioChunk,
        options: &TranscribeOptions,
    ) -> Result<Transcript, SttError>;

    /// Whether the heavy model is currently loaded (resource-discipline probe).
    fn is_loaded(&self) -> bool;

    /// Releases the loaded model, returning its resident footprint toward the
    /// idle baseline (NFR-PERF-03 / NFR-REL-02). The pipeline calls this on
    /// session end; the next `transcribe` transparently reloads. Idempotent.
    fn unload(&self);
}

/// Mean per-token probability over a segment's tokens - the segment confidence
/// (AC-01.7). Pure and model-free so the low-confidence logic is unit-tested
/// without loading whisper. An empty token set yields `0.0` (treated as fully
/// uncertain so it is flagged, never silently trusted).
#[must_use]
pub fn mean_token_confidence(token_probs: &[f32]) -> f32 {
    if token_probs.is_empty() {
        return 0.0;
    }
    let sum: f32 = token_probs.iter().copied().sum();
    (sum / token_probs.len() as f32).clamp(0.0, 1.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn seg(text: &str, confidence: f32) -> TranscriptSegment {
        TranscriptSegment {
            text: text.to_string(),
            confidence,
            t0_ms: 0,
            t1_ms: 0,
        }
    }

    #[test]
    fn mean_confidence_averages_probs() {
        assert!((mean_token_confidence(&[0.9, 0.7, 0.8]) - 0.8).abs() < 1e-6);
    }

    #[test]
    fn mean_confidence_empty_is_zero_so_it_flags() {
        // No tokens -> fully uncertain -> flagged, never silently trusted.
        assert_eq!(mean_token_confidence(&[]), 0.0);
    }

    #[test]
    fn mean_confidence_clamps_into_unit_range() {
        assert_eq!(mean_token_confidence(&[1.5]), 1.0);
        assert_eq!(mean_token_confidence(&[-0.2]), 0.0);
    }

    #[test]
    fn segment_low_confidence_uses_threshold() {
        assert!(seg("hmm", 0.40).is_low_confidence(0.6));
        assert!(!seg("clear", 0.95).is_low_confidence(0.6));
    }

    #[test]
    fn transcript_flags_any_low_confidence_segment() {
        let t = Transcript {
            segments: vec![seg("ok", 0.95), seg("hmm", 0.40)],
            language: DetectedLanguage {
                code: "en".into(),
                auto_detected: true,
            },
        };
        assert!(t.has_low_confidence(0.6));
        assert!(!t.has_low_confidence(0.3));
    }

    #[test]
    fn transcript_text_joins_and_trims_segments() {
        let t = Transcript {
            segments: vec![seg("  hello ", 0.9), seg("world", 0.9), seg("   ", 0.9)],
            language: DetectedLanguage {
                code: "en".into(),
                auto_detected: true,
            },
        };
        assert_eq!(t.text(" "), "hello world");
        assert!(!t.is_empty());
    }

    #[test]
    fn empty_transcript_reports_empty() {
        let t = Transcript {
            segments: vec![],
            language: DetectedLanguage {
                code: "en".into(),
                auto_detected: true,
            },
        };
        assert!(t.is_empty());
        assert_eq!(t.text(" "), "");
    }

    #[test]
    fn transcribe_options_auto_and_pinned() {
        assert_eq!(TranscribeOptions::auto().language, None);
        assert_eq!(
            TranscribeOptions::pinned("ja").language,
            Some("ja".to_string())
        );
        assert_eq!(TranscribeOptions::default(), TranscribeOptions::auto());
    }
}
