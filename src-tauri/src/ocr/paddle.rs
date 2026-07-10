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

use std::sync::{Arc, Mutex};

use image::RgbImage;
use oar_ocr::oarocr::{OAROCRBuilder, OAROCR};

use super::engine::{OcrConfidence, OcrEngine, OcrError, OcrFidelity, OcrLine, OcrOutput};
use crate::models::{ModelArtifact, ModelError, ModelGate, ModelHost, ModelSetDescriptor};

/// The single consent-gated model set covering ALL PP-OCRv5 OCR artifacts
/// (detection + main/latin/korean recognition + dictionaries). One consent grant
/// enables the whole OCR feature regardless of which per-language engine loads
/// (the download host is the same ModelScope registry for every artifact).
pub const OCR_MODEL_SET_ID: &str = "ocr-ppocrv5";

/// Approximate artifact sizes from the oar-ocr model table (docs/models.md); the
/// dictionaries are small text files. Used for the consent disclosure only.
const DET_SIZE: u64 = 4_600_000; // pp-ocrv5_mobile_det.onnx (4.6MB)
const MAIN_REC_SIZE: u64 = 15_800_000; // pp-ocrv5_mobile_rec.onnx (15.8MB)
const LATIN_REC_SIZE: u64 = 7_700_000; // latin_pp-ocrv5_mobile_rec.onnx (7.7MB)
const KOREAN_REC_SIZE: u64 = 12_800_000; // korean_pp-ocrv5_mobile_rec.onnx (12.8MB)
const DICT_SIZE: u64 = 60_000; // ppocrv5*_dict.txt (text, approx)

/// Builds the consent disclosure descriptor for the whole OCR model set. Fetched
/// from ModelScope over HTTPS by oar-ocr's `auto-download` (which SHA-256-verifies
/// each artifact internally); `destination` is oar-ocr's resolved cache dir.
pub fn ocr_model_set_descriptor(destination: std::path::PathBuf) -> ModelSetDescriptor {
    let artifact = |filename: &'static str, size: u64| ModelArtifact {
        filename,
        approx_size_bytes: size,
        sha256: None, // oar-ocr auto-download verifies the hash internally
    };
    ModelSetDescriptor {
        id: OCR_MODEL_SET_ID,
        display_name: "Local OCR models (PaddleOCR PP-OCRv5)",
        host: ModelHost::MODELSCOPE,
        artifacts: vec![
            artifact(ModelSet::MAIN.det, DET_SIZE),
            artifact(ModelSet::MAIN.rec, MAIN_REC_SIZE),
            artifact(ModelSet::MAIN.dict, DICT_SIZE),
            artifact(ModelSet::LATIN.rec, LATIN_REC_SIZE),
            artifact(ModelSet::LATIN.dict, DICT_SIZE),
            artifact(ModelSet::KOREAN.rec, KOREAN_REC_SIZE),
            artifact(ModelSet::KOREAN.dict, DICT_SIZE),
        ],
        destination,
    }
}

/// Fidelity declaration for Vietnamese (human-in-the-loop.md). NAMES the missing
/// charset: the composed tone-mark glyphs live in Latin Extended Additional
/// (U+1E00-U+1EFF), which the PP-OCRv5 latin rec dictionary does not contain
/// (R2 spike, `ppocrv5_latin_dict.txt` inspection). The base letters are
/// recognized confidently, so the drop does NOT lower per-line confidence -
/// which is exactly why an up-front declaration is required.
pub const VI_DEGRADED_REASON: &str = "Vietnamese composed tone-mark diacritics (Latin Extended Additional, U+1E00-U+1EFF) are absent from the PP-OCRv5 latin recognition dictionary; base letters are recognized but tone marks are dropped, and the drop does not lower per-line confidence";

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

    /// PP-OCRv5 SERVER main recognition model (en/ja/zh), the heavier
    /// higher-accuracy variant. Shares the main `ppocrv5_dict.txt` charset with
    /// [`ModelSet::MAIN`] - there is NO latin/Vietnamese server rec in oar-ocr
    /// 0.8.0, only this CJK-charset server rec. Detection is kept on the mobile
    /// det model so an A/B against [`ModelSet::MAIN`] isolates the rec cost.
    /// Evaluated in the R2 spike only (~80MB download, not a default).
    pub const MAIN_SERVER: ModelSet = ModelSet {
        det: "pp-ocrv5_mobile_det.onnx",
        rec: "pp-ocrv5_server_rec.onnx",
        dict: "ppocrv5_dict.txt",
    };
}

/// The local PaddleOCR engine. Cheap to construct; the ONNX Runtime session is
/// built on first `recognize` (lazy, NFR-REL-02).
pub struct PaddleOcrEngine {
    id: &'static str,
    models: ModelSet,
    /// Fail-closed consent gate consulted BEFORE the first model download
    /// (`build_pipeline`). `None` only in the spike/bench harness, which
    /// legitimately downloads behind an explicit feature flag; the production
    /// engines (via `RegionPipeline`) always carry a gate so no silent
    /// auto-download can occur (security-privacy.md).
    gate: Option<Arc<ModelGate>>,
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
            gate: None,
            pipeline: Mutex::new(None),
        }
    }

    /// Attaches the fail-closed consent gate. The production pipeline calls this
    /// so the first model download is refused until the user grants consent over
    /// IPC (security-privacy.md); the spike/bench harness omits it.
    pub fn with_consent_gate(mut self, gate: Arc<ModelGate>) -> Self {
        self.gate = Some(gate);
        self
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

    /// The heavier server main engine (en/ja/zh), R2 spike A/B only.
    pub fn main_server() -> Self {
        Self::new("paddle-ppocrv5-main-server", ModelSet::MAIN_SERVER)
    }

    /// Whether the lazy ONNX Runtime session has been built yet. Used by the R1
    /// idle-footprint probe to prove nothing loads at construction time.
    pub fn is_loaded(&self) -> bool {
        self.pipeline.lock().map(|g| g.is_some()).unwrap_or(false)
    }

    /// Drops the ONNX Runtime session, releasing its ~94MB resident footprint
    /// back toward the idle baseline (NFR-PERF-03 idle < 100MB, NFR-REL-02
    /// release-to-idle-in-60s). The pipeline calls this when a region session
    /// ends; the next `recognize` transparently rebuilds the session lazily.
    /// Idempotent - unloading an already-unloaded engine is a no-op.
    pub fn unload(&self) {
        if let Ok(mut guard) = self.pipeline.lock() {
            *guard = None;
        }
    }

    /// The OCR model set id this engine's downloads are gated under.
    pub fn model_set_id(&self) -> &'static str {
        OCR_MODEL_SET_ID
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
            // FAIL-CLOSED: refuse the (download-triggering) build until first-run
            // consent is granted. `build_pipeline` reaches oar-ocr's auto-download,
            // so the gate must be checked BEFORE it (security-privacy.md).
            if let Some(gate) = &self.gate {
                gate.ensure_download_allowed(OCR_MODEL_SET_ID)
                    .map_err(map_consent_error)?;
            }
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

    fn fidelity(&self, lang: &str) -> OcrFidelity {
        // Only Vietnamese hits the charset ceiling in the R1 pinned PP-OCRv5
        // stack (R2 spike): en/ja/ko/zh are Full. Match case-insensitively on
        // the ISO 639-1 code and accept the `vie` alias.
        match lang.to_ascii_lowercase().as_str() {
            "vi" | "vie" => OcrFidelity::Degraded {
                reason: VI_DEGRADED_REASON.to_string(),
            },
            _ => OcrFidelity::Full,
        }
    }
}

/// Maps a consent-gate error into the OCR error surface. A missing consent
/// becomes [`OcrError::ConsentRequired`] carrying the disclosure (the pipeline
/// forwards it to the UI); other gate errors become model-load failures.
fn map_consent_error(err: ModelError) -> OcrError {
    match err {
        ModelError::ConsentRequired(disclosure) => OcrError::ConsentRequired(disclosure),
        other => OcrError::ModelLoad(other.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fidelity_declares_vietnamese_degraded_and_names_the_charset() {
        let engine = PaddleOcrEngine::latin();
        match engine.fidelity("vi") {
            OcrFidelity::Degraded { reason } => {
                // The reason must NAME the missing charset (human-in-the-loop.md).
                assert!(reason.contains("U+1E00-U+1EFF"));
                assert!(reason.contains("Latin Extended Additional"));
            }
            OcrFidelity::Full => panic!("Vietnamese must be declared Degraded"),
        }
        // The `vie` alias resolves the same way.
        assert!(matches!(
            engine.fidelity("VIE"),
            OcrFidelity::Degraded { .. }
        ));
    }

    #[test]
    fn fidelity_declares_full_for_covered_languages() {
        let engine = PaddleOcrEngine::main();
        for lang in ["en", "ja", "ko", "zh"] {
            assert_eq!(
                engine.fidelity(lang),
                OcrFidelity::Full,
                "{lang} must be Full fidelity"
            );
        }
    }

    #[test]
    fn recognize_fails_closed_without_consent_and_never_loads() {
        // FAIL-CLOSED (security-privacy.md): an engine carrying a consent gate
        // with NO consent recorded refuses recognition with ConsentRequired and
        // never reaches the download-triggering `build_pipeline` - so this test
        // makes no network call. This is the guard that would have caught the
        // silent auto-download the security review flagged.
        use crate::models::{InMemoryConsentStore, ModelGate};
        use std::sync::Arc;

        let gate = Arc::new(ModelGate::new(
            Arc::new(InMemoryConsentStore::default()),
            vec![ocr_model_set_descriptor(std::path::PathBuf::from("/cache"))],
        ));
        let engine = PaddleOcrEngine::latin().with_consent_gate(gate);

        // A non-empty image so the zero-size guard does not short-circuit first.
        let image = RgbImage::new(8, 4);
        match engine.recognize(&image) {
            Err(OcrError::ConsentRequired(disclosure)) => {
                assert_eq!(disclosure.model_set_id, OCR_MODEL_SET_ID);
                assert_eq!(disclosure.host_domain, "modelscope.cn");
                assert!(disclosure.total_approx_size_bytes > 0);
            }
            other => panic!("expected ConsentRequired without a download, got {other:?}"),
        }
        // The download-triggering session build was never reached.
        assert!(!engine.is_loaded());
    }

    #[test]
    fn new_engine_does_not_load_the_ort_session() {
        // Lazy load (NFR-REL-02): construction must not build the ORT session.
        let engine = PaddleOcrEngine::main();
        assert!(!engine.is_loaded());
    }

    #[test]
    fn unload_is_idempotent_on_an_unloaded_engine() {
        let engine = PaddleOcrEngine::main();
        engine.unload();
        assert!(!engine.is_loaded());
    }

    #[test]
    fn zero_sized_image_is_rejected_without_loading() {
        let engine = PaddleOcrEngine::main();
        let empty = RgbImage::new(0, 0);
        assert!(matches!(
            engine.recognize(&empty),
            Err(OcrError::InvalidInput(_))
        ));
        // Rejected before any lazy session build.
        assert!(!engine.is_loaded());
    }

    /// End-to-end session-drop discipline (NFR-PERF-03 / NFR-REL-02): a real
    /// recognize builds the ORT session; `unload` releases it so the resident
    /// ~94MB footprint returns toward the idle baseline. Gated behind
    /// `ocr-spike` (downloads models on first run) so it never runs in default
    /// CI, matching the spike harness.
    #[cfg(feature = "ocr-spike")]
    #[test]
    fn ort_session_is_released_after_unload() {
        use crate::ocr::fixtures::latency_fixture;

        let engine = PaddleOcrEngine::main();
        assert!(!engine.is_loaded(), "session must not load at construction");

        let fixture = latency_fixture(400, 100, 34.0).expect("latin system font");
        engine.recognize(&fixture.image).expect("recognize");
        assert!(engine.is_loaded(), "session must be built after recognize");

        engine.unload();
        assert!(
            !engine.is_loaded(),
            "session must be released after unload (session end)"
        );
    }
}
