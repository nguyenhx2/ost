//! Local PaddleOCR PP-OCRv5 backend via `oar-ocr` + ONNX Runtime (ADR-004).
//!
//! This is the default, always-present [`OcrEngine`] implementation. Models are
//! resolved through oar-ocr's `auto-download` cache (ModelScope) on first use;
//! the ONNX Runtime session is built LAZILY on the first `recognize` call and
//! never at app start, so the idle footprint stays inside NFR-PERF-03 until a
//! region is actually translated (NFR-REL-02).
//!
//! PP-OCRv5's single main recognition model covers en/ja/zh; the latin and
//! korean recognition models extend coverage to Vietnamese and Korean. Each
//! [`ModelSet`] shares the one detection model.

use std::sync::Mutex;

use image::RgbImage;
use oar_ocr::oarocr::{OAROCRBuilder, OAROCR};

use super::engine::{OcrConfidence, OcrEngine, OcrError, OcrLine, OcrOutput};

/// A PP-OCRv5 detection + recognition + dictionary triple. Names are the
/// oar-ocr registry entries; passing a bare filename triggers the auto-download
/// cache lookup (ModelScope) - nothing is committed to the repo.
#[derive(Debug, Clone, Copy)]
pub struct ModelSet {
    /// Text-detection ONNX model (shared across recognition languages).
    pub det: &'static str,
    /// Text-recognition ONNX model.
    pub rec: &'static str,
    /// Character dictionary for the recognition model.
    pub dict: &'static str,
}

impl ModelSet {
    /// PP-OCRv5 main model set: English, Japanese (incl. kanji/kana) and Chinese
    /// in one recognition model (ADR-004 rationale #1).
    pub const MAIN: ModelSet = ModelSet {
        det: "pp-ocrv5_mobile_det.onnx",
        rec: "pp-ocrv5_mobile_rec.onnx",
        dict: "ppocrv5_dict.txt",
    };

    /// PP-OCRv5 latin recognition model: covers Vietnamese (owner hard
    /// requirement - the only local engine that recognizes vi at all).
    pub const LATIN: ModelSet = ModelSet {
        det: "pp-ocrv5_mobile_det.onnx",
        rec: "latin_pp-ocrv5_mobile_rec.onnx",
        dict: "ppocrv5_latin_dict.txt",
    };

    /// PP-OCRv5 korean recognition model.
    pub const KOREAN: ModelSet = ModelSet {
        det: "pp-ocrv5_mobile_det.onnx",
        rec: "korean_pp-ocrv5_mobile_rec.onnx",
        dict: "ppocrv5_korean_dict.txt",
    };
}

/// The local PaddleOCR engine. Cheap to construct; the ONNX Runtime session is
/// built on first `recognize` (lazy, NFR-REL-02).
pub struct PaddleOcrEngine {
    id: &'static str,
    models: ModelSet,
    /// Lazily-built pipeline. `None` until the first `recognize`. The `Mutex`
    /// keeps the type `Sync` and serializes the one-time build; recognition
    /// itself is single-flighted here, which is sufficient for the region
    /// pipeline (one active region at a time).
    pipeline: Mutex<Option<OAROCR>>,
}

impl PaddleOcrEngine {
    /// Creates an engine for `models` without loading anything (no ORT session,
    /// no model download until the first `recognize`).
    pub fn new(id: &'static str, models: ModelSet) -> Self {
        Self {
            id,
            models,
            pipeline: Mutex::new(None),
        }
    }

    /// The default engine (PP-OCRv5 main: en/ja/zh).
    pub fn main() -> Self {
        Self::new("paddle-ppocrv5-main", ModelSet::MAIN)
    }

    /// The Vietnamese/latin engine.
    pub fn latin() -> Self {
        Self::new("paddle-ppocrv5-latin", ModelSet::LATIN)
    }

    /// The Korean engine.
    pub fn korean() -> Self {
        Self::new("paddle-ppocrv5-korean", ModelSet::KOREAN)
    }

    /// Whether the lazy ONNX Runtime session has been built yet. Used by the R1
    /// idle-footprint probe to prove nothing loads at construction time.
    pub fn is_loaded(&self) -> bool {
        self.pipeline.lock().map(|g| g.is_some()).unwrap_or(false)
    }

    /// Builds the oar-ocr pipeline (downloads models on first call, then builds
    /// the ORT session).
    fn build_pipeline(&self) -> Result<OAROCR, OcrError> {
        OAROCRBuilder::new(self.models.det, self.models.rec, self.models.dict)
            .build()
            .map_err(|e| OcrError::ModelLoad(e.to_string()))
    }
}

impl OcrEngine for PaddleOcrEngine {
    fn id(&self) -> &'static str {
        self.id
    }

    fn recognize(&self, image: &RgbImage) -> Result<OcrOutput, OcrError> {
        if image.width() == 0 || image.height() == 0 {
            return Err(OcrError::InvalidInput("zero-sized image".to_string()));
        }

        // Lazy build + single-flight recognition under the same lock. The lock
        // is never poisoned in normal operation; map the poison case to an
        // inference error rather than panicking.
        let mut guard = self
            .pipeline
            .lock()
            .map_err(|_| OcrError::Inference("OCR pipeline lock poisoned".to_string()))?;
        if guard.is_none() {
            *guard = Some(self.build_pipeline()?);
        }
        let pipeline = guard
            .as_ref()
            .ok_or_else(|| OcrError::Inference("OCR pipeline unavailable".to_string()))?;

        let results = pipeline
            .predict(vec![image.clone()])
            .map_err(|e| OcrError::Inference(e.to_string()))?;

        let mut lines: Vec<OcrLine> = Vec::new();
        let mut scores: Vec<f32> = Vec::new();
        for result in &results {
            for region in &result.text_regions {
                if let Some(text) = &region.text {
                    let confidence = region.confidence;
                    lines.push(OcrLine {
                        text: text.to_string(),
                        confidence,
                    });
                    if let Some(c) = confidence {
                        scores.push(c);
                    }
                }
            }
        }

        Ok(OcrOutput {
            confidence: OcrConfidence::PerLine(scores),
            lines,
        })
    }
}
