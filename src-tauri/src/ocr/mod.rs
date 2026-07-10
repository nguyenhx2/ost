//! OCR engine behind the `OcrEngine` trait (FR-02).
//!
//! Default backend: local PaddleOCR PP-OCRv5 via `oar-ocr` + ONNX Runtime
//! (ADR-004). The pipeline integration (capture -> OCR -> translate) is gated
//! behind the R1 latency/accuracy spike and is NOT wired here yet.

pub mod engine;
pub mod paddle;

#[cfg(feature = "ocr-spike")]
pub mod fixtures;

pub use engine::{
    character_accuracy, character_error_rate, OcrConfidence, OcrEngine, OcrError, OcrFidelity,
    OcrLine, OcrOutput,
};
pub use paddle::{ocr_model_set_descriptor, ModelSet, PaddleOcrEngine, OCR_MODEL_SET_ID};
