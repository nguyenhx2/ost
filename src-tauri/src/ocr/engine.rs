//! The `OcrEngine` trait and its result types (FR-02, NFR-SCA-01).
//!
//! This is the single surface the capture -> OCR -> translate pipeline uses to
//! run recognition. Platform/engine-specific implementations (local PaddleOCR
//! per ADR-004, Windows.Media.Ocr and cloud backends later) live behind this
//! trait so the Phase-4 ports swap impls, not call sites.
//!
//! Recognized text is untrusted DATA: it flows to the provider layer as data
//! and is never interpreted as instructions (agent-guardrails.md section 2).

use image::RgbImage;

/// Errors surfaced by any [`OcrEngine`] implementation.
#[derive(Debug, thiserror::Error)]
pub enum OcrError {
    /// The engine could not load its model(s) (missing file, download failure,
    /// or ONNX Runtime session init failure). Held separate because it is the
    /// lazy-init failure class (NFR-REL-02) the caller reports distinctly.
    #[error("OCR model load failed: {0}")]
    ModelLoad(String),

    /// Recognition failed on an otherwise-valid image (inference error).
    #[error("OCR inference failed: {0}")]
    Inference(String),

    /// The input image was rejected (zero-sized or otherwise unusable).
    #[error("invalid OCR input: {0}")]
    InvalidInput(String),

    /// The engine needs to download models but first-run consent has not been
    /// granted (fail-closed, security-privacy.md). Carries the disclosure so the
    /// pipeline can ask the user; recognition is refused until consent is given.
    #[error("OCR model download requires consent: {}", .0.model_set_id)]
    ConsentRequired(Box<crate::models::ConsentDisclosure>),
}

/// Per-language recognition fidelity declaration (human-in-the-loop.md).
///
/// The low-confidence flag ([`OcrOutput::has_low_confidence`]) only catches
/// characters the model is *unsure* about. Some backends drop whole character
/// classes *confidently* - the PP-OCRv5 latin rec model emits Vietnamese base
/// letters at ~0.97 confidence while silently dropping the composed tone marks
/// (R2 spike). Shipping that silently would violate "low-confidence output is
/// flagged instead of a silent best-guess". [`OcrFidelity`] is the mandatory,
/// per-language up-front declaration the UI surfaces so the user knows a whole
/// glyph class may be missing regardless of the confidence score.
#[derive(Debug, Clone, PartialEq)]
pub enum OcrFidelity {
    /// The engine's charset fully covers this language.
    Full,
    /// The engine recognizes this language but a known character class is
    /// unrepresentable; `reason` NAMES the missing charset in plain text.
    Degraded { reason: String },
}

/// Per-line confidence, enum-tagged per ADR-004 decision #7 / AC-02.6.
///
/// Local PaddleOCR yields real per-line recognition confidence
/// ([`OcrConfidence::PerLine`]); backends without a confidence signal
/// (Windows.Media.Ocr, multimodal-LLM) return
/// [`OcrConfidence::Unavailable`] so the UI shows a standing "unverified"
/// banner instead of a silent best-guess (BR-05).
#[derive(Debug, Clone, PartialEq)]
pub enum OcrConfidence {
    /// One score in `[0.0, 1.0]` per recognized line, index-aligned with
    /// [`OcrOutput::lines`].
    PerLine(Vec<f32>),
    /// The backend exposes no confidence signal; `reason` names why.
    Unavailable { reason: String },
}

/// One recognized text line with its optional confidence.
#[derive(Debug, Clone, PartialEq)]
pub struct OcrLine {
    /// The recognized text (untrusted DATA).
    pub text: String,
    /// Per-line recognition confidence in `[0.0, 1.0]` when the backend
    /// provides it; `None` for `Unavailable` backends.
    pub confidence: Option<f32>,
}

/// The full recognition result for one region crop.
#[derive(Debug, Clone, PartialEq)]
pub struct OcrOutput {
    /// Recognized lines in reading order.
    pub lines: Vec<OcrLine>,
    /// Confidence signal for the whole result (see [`OcrConfidence`]).
    pub confidence: OcrConfidence,
}

impl OcrOutput {
    /// The recognized lines joined by `separator` (what the translate stage
    /// receives as its source text).
    pub fn concatenated(&self, separator: &str) -> String {
        self.lines
            .iter()
            .map(|l| l.text.as_str())
            .collect::<Vec<_>>()
            .join(separator)
    }

    /// Whether any line falls below `threshold` confidence - the signal the UI
    /// uses to flag a low-confidence region (AC-02.6). Returns `false` when
    /// confidence is [`OcrConfidence::Unavailable`] (the standing banner covers
    /// that case instead).
    pub fn has_low_confidence(&self, threshold: f32) -> bool {
        match &self.confidence {
            OcrConfidence::PerLine(scores) => scores.iter().any(|&s| s < threshold),
            OcrConfidence::Unavailable { .. } => false,
        }
    }
}

/// One OCR backend. Implementations own their model lifecycle and MUST load
/// heavy models lazily (never at app start, NFR-REL-02).
///
/// `recognize` is synchronous and CPU-bound: the pipeline runs it on a blocking
/// task (`tokio::task::spawn_blocking`) so it never blocks an async runtime.
pub trait OcrEngine: Send + Sync {
    /// A short, stable identifier for the backend (telemetry/UI badge).
    fn id(&self) -> &'static str;

    /// Consults any fail-closed download/consent gate WITHOUT capturing the
    /// screen or building the model session (TASK-021 ordering fix). The region
    /// pipeline calls this BEFORE `capture` so a first-run consent refusal (raised
    /// as [`OcrError::ConsentRequired`]) or any other not-ready condition fires
    /// before a single pixel is grabbed (security-privacy.md fail-closed,
    /// human-in-the-loop.md). The default is "always ready" for backends that
    /// need no download (mocks, the future Windows.Media.Ocr impl).
    fn ensure_ready(&self) -> Result<(), OcrError> {
        Ok(())
    }

    /// Recognizes text in one region crop.
    fn recognize(&self, image: &RgbImage) -> Result<OcrOutput, OcrError>;

    /// Declares this backend's recognition fidelity for `lang` (ISO 639-1),
    /// independent of any single result's confidence (human-in-the-loop.md).
    /// The pipeline attaches the declaration for the detected source language
    /// to the OCR result so the UI can warn the user up front when a whole
    /// character class (e.g. Vietnamese tone marks) is unrepresentable.
    fn fidelity(&self, lang: &str) -> OcrFidelity;
}

/// Character Error Rate between a reference and a hypothesis string, computed
/// over Unicode scalar values (Levenshtein distance / reference length).
///
/// Used by the R1 accuracy spike; also a small, dependency-free building block
/// the pipeline can reuse. Returns `0.0` when both strings are empty and `1.0`
/// when the reference is empty but the hypothesis is not.
pub fn character_error_rate(reference: &str, hypothesis: &str) -> f32 {
    let r: Vec<char> = reference.chars().collect();
    let h: Vec<char> = hypothesis.chars().collect();
    if r.is_empty() {
        return if h.is_empty() { 0.0 } else { 1.0 };
    }
    let distance = levenshtein(&r, &h);
    (distance as f32) / (r.len() as f32)
}

/// Character accuracy = `1.0 - CER`, clamped to `[0.0, 1.0]`.
pub fn character_accuracy(reference: &str, hypothesis: &str) -> f32 {
    (1.0 - character_error_rate(reference, hypothesis)).clamp(0.0, 1.0)
}

/// Levenshtein edit distance over char slices (two-row DP).
fn levenshtein(a: &[char], b: &[char]) -> usize {
    if a.is_empty() {
        return b.len();
    }
    if b.is_empty() {
        return a.len();
    }
    let mut prev: Vec<usize> = (0..=b.len()).collect();
    let mut curr: Vec<usize> = vec![0; b.len() + 1];
    for (i, &ca) in a.iter().enumerate() {
        curr[0] = i + 1;
        for (j, &cb) in b.iter().enumerate() {
            let cost = if ca == cb { 0 } else { 1 };
            curr[j + 1] = (prev[j + 1] + 1).min(curr[j] + 1).min(prev[j] + cost);
        }
        std::mem::swap(&mut prev, &mut curr);
    }
    prev[b.len()]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cer_identical_is_zero() {
        assert_eq!(character_error_rate("hello", "hello"), 0.0);
        assert_eq!(character_accuracy("hello", "hello"), 1.0);
    }

    #[test]
    fn cer_both_empty_is_zero() {
        assert_eq!(character_error_rate("", ""), 0.0);
    }

    #[test]
    fn cer_empty_reference_nonempty_hyp_is_one() {
        assert_eq!(character_error_rate("", "x"), 1.0);
    }

    #[test]
    fn cer_single_substitution() {
        // "cat" -> "car": one substitution over 3 chars.
        assert!((character_error_rate("cat", "car") - (1.0 / 3.0)).abs() < 1e-6);
    }

    #[test]
    fn cer_counts_unicode_scalars_not_bytes() {
        // Vietnamese + Japanese: one wrong char over four reference chars.
        assert!((character_error_rate("日本語だ", "日本語よ") - 0.25).abs() < 1e-6);
        assert!((character_error_rate("Cảm ơn", "Cảm ơn") - 0.0).abs() < 1e-6);
    }

    #[test]
    fn low_confidence_flag_uses_threshold() {
        let out = OcrOutput {
            lines: vec![
                OcrLine {
                    text: "ok".into(),
                    confidence: Some(0.95),
                },
                OcrLine {
                    text: "hmm".into(),
                    confidence: Some(0.40),
                },
            ],
            confidence: OcrConfidence::PerLine(vec![0.95, 0.40]),
        };
        assert!(out.has_low_confidence(0.6));
        assert!(!out.has_low_confidence(0.3));
    }

    #[test]
    fn unavailable_confidence_never_flags_low() {
        let out = OcrOutput {
            lines: vec![OcrLine {
                text: "x".into(),
                confidence: None,
            }],
            confidence: OcrConfidence::Unavailable {
                reason: "backend has no confidence".into(),
            },
        };
        assert!(!out.has_low_confidence(0.99));
    }

    #[test]
    fn concatenated_joins_lines() {
        let out = OcrOutput {
            lines: vec![
                OcrLine {
                    text: "a".into(),
                    confidence: Some(1.0),
                },
                OcrLine {
                    text: "b".into(),
                    confidence: Some(1.0),
                },
            ],
            confidence: OcrConfidence::PerLine(vec![1.0, 1.0]),
        };
        assert_eq!(out.concatenated("\n"), "a\nb");
    }
}
