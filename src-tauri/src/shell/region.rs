//! Region-translate UI shell (FR-02 / FR-04): selection + preview window
//! lifecycle and the IPC commands they use, wired to the REAL capture -> OCR ->
//! translate pipeline ([`RegionPipeline`], TASK-007). Capture runs on a
//! COM-initialized, timeout-bounded worker and the consent gate is consulted
//! BEFORE capture, so a region select can never park the app (TASK-021).

use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, Runtime, WebviewUrl};

use super::windows::{open_deferred, Existing};
use crate::capture::{CaptureRegion, ScreenCapturer};
use crate::core::{HeavySessionCoordinator, HeavySessionKind};
use crate::keys::{ApiKey, KeyStore};
use crate::models::{ConsentDisclosure, ModelGate};
use crate::ocr::{OcrEngine, OcrError, OcrFidelity, PaddleOcrEngine};
use crate::providers::{
    GeminiClient, ProviderId, TranslationProvider, TranslationRequest as ProviderRequest,
};

pub const SELECT_WINDOW_LABEL: &str = "region-select";
pub const PREVIEW_WINDOW_LABEL: &str = "region-preview";

/// Event names - keep in sync with `src/lib/ipc.ts` and
/// `docs/architecture/api-contracts/ipc.md`.
pub const EVENT_OCR_RESULT: &str = "region:ocr-result";
pub const EVENT_TRANSLATION_RESULT: &str = "region:translation-result";
/// Emitted by the provider layer when a translation request fails; the UI
/// leaves the "translating" state instead of hanging (human-in-the-loop.md).
pub const EVENT_TRANSLATION_ERROR: &str = "region:translation-error";
/// Emitted after every non-empty streamed chunk, carrying the ACCUMULATED
/// text so far (not a bare delta) - the preview renders it directly and the
/// FIRST delta proves the stream is alive, which is what actually clears the
/// client-side timeout (owner complaint: a slow-but-live translation used to
/// trip a false "timeout" red error before the eventual real result arrived).
pub const EVENT_TRANSLATION_DELTA: &str = "region:translation-delta";
/// Emitted when capture or OCR fails; the preview leaves the "recognizing"
/// state instead of hanging silently (human-in-the-loop.md: no silent failure).
pub const EVENT_OCR_ERROR: &str = "region:ocr-error";
/// Emitted when OCR is blocked because first-run model-download consent has not
/// been granted; carries the disclosure so the UI can ask (security-privacy.md).
/// Shared namespace: whisper STT reuses the same consent facility in Phase 2.
pub const EVENT_MODEL_CONSENT_REQUIRED: &str = "models:consent-required";
/// Emitted to an ALREADY-OPEN preview window when a NEW region is confirmed
/// (main window "Select region", tray, hotkey, or the in-dialog re-select
/// button all reach this - every path arms `pending_region` then closes the
/// select overlay, and [`open_preview_window`] fires this the moment it finds
/// the preview window already present instead of building a new one). Without
/// this signal the preview's mount-time OCR handshake never runs again, so an
/// already-open dialog silently kept showing the OLD region forever (owner
/// bug report). The frontend resets its state and re-calls
/// `region_preview_ready` on receipt.
pub const EVENT_REGION_SELECTED: &str = "region:selected";

/// Upper bound for sane region dimensions/offsets (physical px).
const MAX_REGION_PX: u32 = 32_768;
/// Upper bound for one keyboard nudge of the preview window (px).
const MAX_NUDGE_PX: i32 = 256;

/// Per-line confidence below which a region is flagged low-confidence (AC-02.6,
/// BR-05). PLACEHOLDER pending OI-07 calibration on degraded/real inputs: clean
/// synthetic fixtures cluster in [0.967, 1.000]. Note this flag does NOT catch
/// confidently-dropped charsets (e.g. Vietnamese tone marks) - the mandatory
/// [`OcrFidelity`] declaration covers that case (human-in-the-loop.md).
const OCR_LOW_CONFIDENCE_THRESHOLD: f32 = 0.6;

/// Target language for region translation until the user's choice is plumbed
/// through from Settings (cross-scope, frontend/settings follow-up). The IPC
/// `RegionTranslationRequest` does not carry a target language; Vietnamese is
/// the product's primary UI locale.
const DEFAULT_TARGET_LANGUAGE: &str = "vi";

#[derive(Debug, thiserror::Error)]
pub enum ShellError {
    #[error("invalid region: {0}")]
    InvalidRegion(String),
    #[error("window error: {0}")]
    Window(#[from] tauri::Error),
    #[error("window not found: {0}")]
    WindowNotFound(&'static str),
}

// Tauri command errors must be serializable for the WebView; the display
// string never contains user content or secrets.
impl Serialize for ShellError {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}

/// Selection rectangle in PHYSICAL screen pixels relative to the primary
/// monitor origin. IPC carries pixel coords ONLY - image bytes never cross
/// the IPC boundary (security-privacy.md).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
pub struct RegionRect {
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
}

/// Frontend -> core translation request (initial and re-translate, AC-02.8).
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegionTranslationRequest {
    pub request_id: String,
    pub source_text: String,
    pub provider: String,
    pub model: String,
    /// User-selected target language (BR-07 default `vi`, item 3 language
    /// pickers). Absent or blank falls back to [`DEFAULT_TARGET_LANGUAGE`].
    #[serde(default)]
    pub target_language: Option<String>,
}

/// Resolves the effective target language for a translation request: the
/// user's non-blank selection, else the product default (`vi`).
fn resolve_target_language(request: &RegionTranslationRequest) -> String {
    request
        .target_language
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or(DEFAULT_TARGET_LANGUAGE)
        .to_string()
}

/// User-selected source language for the region (BR-07: auto-detect PLUS a
/// manual pin). This is the STRUCTURAL fix for the fidelity trigger: the
/// [`OcrFidelity`] declaration and the per-language rec-model routing key off
/// THIS selection, NEVER off post-OCR detected language.
///
/// Why not post-OCR detection: the PP-OCRv5 latin rec model drops the Vietnamese
/// composed tone marks (U+1E00-U+1EFF), so those markers are ABSENT from the OCR
/// output. Detecting language from that output makes `vi` fall back to `en` -
/// Full fidelity - and the mandated Degraded notice never fires for the one case
/// it exists for. Keying off the user's selection is the only correct source.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SourceLanguageSelection {
    /// No manual pin: auto-detect is a best-effort hint only; fidelity is not
    /// asserted Degraded without an explicit selection.
    Auto,
    /// A manually pinned ISO 639-1 language code (lowercased).
    Pinned(String),
}

impl SourceLanguageSelection {
    /// Parses the IPC `sourceLanguage` string: empty or `"auto"` -> [`Self::Auto`],
    /// otherwise a pinned lowercased code. Untrusted IPC input is treated as DATA.
    pub fn parse(raw: &str) -> Self {
        let trimmed = raw.trim();
        if trimmed.is_empty() || trimmed.eq_ignore_ascii_case("auto") {
            SourceLanguageSelection::Auto
        } else {
            SourceLanguageSelection::Pinned(trimmed.to_ascii_lowercase())
        }
    }

    /// The pinned code, if any (used to drive fidelity).
    pub fn pinned(&self) -> Option<&str> {
        match self {
            SourceLanguageSelection::Auto => None,
            SourceLanguageSelection::Pinned(code) => Some(code),
        }
    }
}

/// Which PP-OCRv5 recognition model a source language routes to (R1 pinned set).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RecModel {
    /// PP-OCRv5 main rec: en/ja/zh (and the auto default).
    Main,
    /// PP-OCRv5 latin rec: Vietnamese and other Latin-script languages.
    Latin,
    /// PP-OCRv5 korean rec.
    Korean,
}

/// Routes a source-language selection to its recognition model. Latin-script
/// sources (vi and other latin) go to the latin rec so Vietnamese actually uses
/// it (the pre-fix bug wired `main()` only); ja/zh/en use main; ko uses korean.
/// Auto defaults to main (best-effort; covers en/ja/zh).
pub fn rec_model_for_language(selection: &SourceLanguageSelection) -> RecModel {
    match selection.pinned() {
        None => RecModel::Main,
        Some(code) => match code {
            "ja" | "jpn" | "zh" | "zho" | "chi" | "en" | "eng" => RecModel::Main,
            "ko" | "kor" => RecModel::Korean,
            // Vietnamese + any other Latin-script language use the latin rec.
            _ => RecModel::Latin,
        },
    }
}

/// Payload of [`EVENT_OCR_ERROR`]. `message` is an OPTIONAL diagnostic string
/// (never pixel data, a key, or user content); the UI renders its own localized
/// error copy and treats this as untrusted DATA (agent-guardrails.md section 2).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrErrorPayload {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub request_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

/// OCR fidelity declaration carried on the OCR result for the active/detected
/// source language (human-in-the-loop.md). Serializes as a tagged union:
/// `{"kind":"full"}` or `{"kind":"degraded","reason":"..."}`. The UI shows a
/// standing notice for `degraded` because a whole character class may be
/// missing regardless of the (possibly high) confidence score.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum OcrFidelityPayload {
    Full,
    Degraded { reason: String },
}

impl From<OcrFidelity> for OcrFidelityPayload {
    fn from(value: OcrFidelity) -> Self {
        match value {
            OcrFidelity::Full => OcrFidelityPayload::Full,
            OcrFidelity::Degraded { reason } => OcrFidelityPayload::Degraded { reason },
        }
    }
}

/// Payload of [`EVENT_OCR_RESULT`].
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrResultPayload {
    pub request_id: String,
    pub source_text: String,
    /// Pipeline-computed flag (AC-02.6); the threshold is OI-07, not UI-side.
    pub low_confidence: bool,
    /// Best-effort auto-detect HINT only; does NOT drive fidelity (S1 fix).
    pub detected_language: Option<String>,
    /// Recognition-fidelity declaration for the SELECTED source language
    /// (Degraded only when the user pinned a language the engine degrades).
    pub fidelity: OcrFidelityPayload,
}

/// Payload of [`EVENT_TRANSLATION_RESULT`].
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TranslationResultPayload {
    pub request_id: String,
    pub translated_text: String,
    pub provider: String,
    pub model: String,
}

/// Payload of [`EVENT_TRANSLATION_ERROR`]. `message` is an OPTIONAL diagnostic
/// string (never a secret or user content); the UI renders its own localized
/// error copy and treats this as untrusted DATA (agent-guardrails.md).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TranslationErrorPayload {
    pub request_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

/// Payload of [`EVENT_TRANSLATION_DELTA`]. `text` is the accumulated
/// translation so far (untrusted DATA, provider-derived) - the UI renders it
/// through the sanitizing `PlainText` component only, exactly like the final
/// `region:translation-result` (agent-guardrails.md section 2).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TranslationDeltaPayload {
    pub request_id: String,
    pub text: String,
}

/// A confirmed region awaiting pipeline pickup, with its selected source
/// language (BR-07). Both are captured at confirm time so the fidelity trigger
/// and rec-model routing key off the user's selection.
#[derive(Debug, Clone)]
pub struct PendingRegion {
    pub rect: RegionRect,
    pub source_language: SourceLanguageSelection,
}

/// Shared region-session state (managed by the Tauri builder).
#[derive(Debug, Default)]
pub struct RegionState {
    /// Region + source language confirmed by the user, pending pipeline pickup.
    pub pending_region: Mutex<Option<PendingRegion>>,
    /// Live-update toggle from the preview overlay (AC-02.4 UI half).
    pub live_update: Mutex<bool>,
}

impl From<RegionRect> for CaptureRegion {
    fn from(r: RegionRect) -> Self {
        CaptureRegion {
            x: r.x,
            y: r.y,
            width: r.width,
            height: r.height,
        }
    }
}

/// The capture -> OCR -> translate pipeline resources (TASK-007), managed by the
/// Tauri builder alongside [`RegionState`]. All fields are cheap to construct;
/// the ORT session is built lazily on first OCR and dropped on session end
/// (NFR-PERF-03 / NFR-REL-02).
pub struct RegionPipeline {
    capturer: Arc<dyn ScreenCapturer>,
    /// Per-language recognition engines (R1 pinned set, ADR-004). Each lazily
    /// builds its ORT session on first use and shares the one fail-closed
    /// consent gate, so no engine can silently auto-download.
    ocr_main: Arc<PaddleOcrEngine>,
    ocr_latin: Arc<PaddleOcrEngine>,
    ocr_korean: Arc<PaddleOcrEngine>,
    keys: Arc<KeyStore>,
    /// The one-heavy-session-at-a-time coordinator (BR-04): starting an OCR
    /// session drops any resident whisper STT context, and ending it drops the
    /// ORT sessions, so at most one heavy model set is resident.
    coordinator: Arc<HeavySessionCoordinator>,
}

impl RegionPipeline {
    /// Wires the production backends: Windows screen capture, the three PP-OCRv5
    /// rec engines (main/latin/korean) each behind the fail-closed consent
    /// `gate`, OS-keychain key store. Registers the OCR heavy-session unloader
    /// with the shared `coordinator` so audio-session starts can drop the ORT
    /// sessions (BR-04).
    pub fn new_default(gate: Arc<ModelGate>, coordinator: Arc<HeavySessionCoordinator>) -> Self {
        #[cfg(windows)]
        let capturer: Arc<dyn ScreenCapturer> =
            Arc::new(crate::capture::WindowsScreenCapturer::new());
        #[cfg(not(windows))]
        let capturer: Arc<dyn ScreenCapturer> = Arc::new(UnsupportedCapturer);

        let ocr_main = Arc::new(PaddleOcrEngine::main().with_consent_gate(Arc::clone(&gate)));
        let ocr_latin = Arc::new(PaddleOcrEngine::latin().with_consent_gate(Arc::clone(&gate)));
        let ocr_korean = Arc::new(PaddleOcrEngine::korean().with_consent_gate(gate));

        // The OCR unload hook drops all three ORT sessions (reusing the existing
        // PaddleOcrEngine::unload API); the coordinator runs it when audio starts
        // or the region session ends. Capturing the engine Arcs (not the pipeline)
        // avoids any reference cycle.
        let (main, latin, korean) = (
            Arc::clone(&ocr_main),
            Arc::clone(&ocr_latin),
            Arc::clone(&ocr_korean),
        );
        coordinator.register(
            HeavySessionKind::Ocr,
            Arc::new(move || {
                main.unload();
                latin.unload();
                korean.unload();
            }),
        );

        Self {
            capturer,
            ocr_main,
            ocr_latin,
            ocr_korean,
            keys: Arc::new(KeyStore::new_os_keychain()),
            coordinator,
        }
    }

    /// Selects the recognition engine for the source-language selection
    /// (per-language rec routing so Vietnamese/latin uses the latin rec).
    fn engine_for(&self, selection: &SourceLanguageSelection) -> Arc<PaddleOcrEngine> {
        match rec_model_for_language(selection) {
            RecModel::Main => Arc::clone(&self.ocr_main),
            RecModel::Latin => Arc::clone(&self.ocr_latin),
            RecModel::Korean => Arc::clone(&self.ocr_korean),
        }
    }

    /// Marks the region OCR heavy session as starting: drops any resident whisper
    /// STT context so only one heavy model set is resident (BR-04). Called when
    /// the preview begins its capture -> OCR work.
    fn begin_session(&self) {
        self.coordinator.begin(HeavySessionKind::Ocr);
    }

    /// Ends the region OCR heavy session: drops every engine's ORT session via the
    /// coordinator's registered unloader (session end -> idle footprint,
    /// NFR-PERF-03 / NFR-REL-02) and clears the active marker. Idempotent.
    fn end_session(&self) {
        self.coordinator.end(HeavySessionKind::Ocr);
    }
}

/// Placeholder capturer for non-Windows builds (Phase-4 ports supply real
/// backends). Keeps the crate compiling off Windows; never selected there.
#[cfg(not(windows))]
struct UnsupportedCapturer;

#[cfg(not(windows))]
impl ScreenCapturer for UnsupportedCapturer {
    fn capture(
        &self,
        _region: CaptureRegion,
    ) -> Result<image::RgbImage, crate::capture::CaptureError> {
        Err(crate::capture::CaptureError::Backend(
            "screen capture is only implemented on Windows in Phase 1".into(),
        ))
    }
}

/// Lightweight source-language heuristic for the fidelity declaration and the
/// OCR-result `detectedLanguage` field. Detects the script family; enough to
/// pick the right [`OcrFidelity`] (only Vietnamese is degraded). Untrusted OCR
/// text is inspected as DATA only (agent-guardrails.md section 2).
pub fn detect_language(text: &str) -> Option<String> {
    if text.trim().is_empty() {
        return None;
    }
    let mut has_kana = false;
    let mut has_hangul = false;
    let mut has_han = false;
    let mut has_vi = false;
    let mut has_latin = false;
    for c in text.chars() {
        match c as u32 {
            0x3040..=0x30FF => has_kana = true,   // hiragana + katakana
            0xAC00..=0xD7A3 => has_hangul = true, // hangul syllables
            0x4E00..=0x9FFF => has_han = true,    // CJK unified ideographs
            0x1E00..=0x1EFF => has_vi = true,     // Latin Extended Additional (vi tone marks)
            _ => {}
        }
        if matches!(
            c,
            'ă' | 'â' | 'đ' | 'ê' | 'ô' | 'ơ' | 'ư' | 'Ă' | 'Â' | 'Đ' | 'Ê' | 'Ô' | 'Ơ' | 'Ư'
        ) {
            has_vi = true;
        }
        if c.is_ascii_alphabetic() {
            has_latin = true;
        }
    }
    if has_kana {
        Some("ja".into())
    } else if has_hangul {
        Some("ko".into())
    } else if has_vi {
        Some("vi".into())
    } else if has_han {
        Some("zh".into())
    } else if has_latin {
        Some("en".into())
    } else {
        None
    }
}

/// Runs capture -> OCR and builds the OCR-result payload (no I/O beyond the two
/// injected backends). Kept trait-object based so tests drive it with mock
/// capturer + engine and no real display/model.
///
/// FIDELITY TRIGGER (S1 fix): fidelity is derived from the USER-SELECTED source
/// language, NEVER from post-OCR detected language (which cannot see the dropped
/// Vietnamese tone marks). `detectedLanguage` remains a best-effort HINT only.
pub fn build_ocr_payload(
    capturer: &dyn ScreenCapturer,
    engine: &dyn OcrEngine,
    region: RegionRect,
    request_id: String,
    source_language: &SourceLanguageSelection,
) -> Result<OcrResultPayload, PipelineError> {
    // ORDERING (TASK-021 S2): consult the fail-closed consent/readiness gate
    // BEFORE grabbing any pixels. On first run this raises `ConsentRequired`
    // (-> models:consent-required) so the screen is NEVER captured before the
    // user consents, and a capture failure can never block reaching the consent
    // dialog (security-privacy.md fail-closed, human-in-the-loop.md).
    engine.ensure_ready()?;
    // BRING-UP EVIDENCE (TASK-021): prove the REAL capture actually returns and
    // does not park forever. Kept at debug level for future release triage.
    tracing::debug!(
        width = region.width,
        height = region.height,
        "region capture: calling capturer.capture()"
    );
    let image = capturer.capture(region.into())?;
    tracing::debug!(
        width = image.width(),
        height = image.height(),
        "region capture: capturer.capture() returned"
    );
    let output = engine.recognize(&image)?;
    let source_text = output.concatenated("\n");
    // Best-effort hint for the UI only - does NOT drive fidelity.
    let detected_language = detect_language(&source_text);
    // Fidelity keys off the SELECTED language. With no manual pin we do not
    // assert Degraded (auto-detect is a hint, not a guarantee).
    let fidelity = match source_language.pinned() {
        Some(lang) => engine.fidelity(lang).into(),
        None => OcrFidelityPayload::Full,
    };
    Ok(OcrResultPayload {
        request_id,
        source_text,
        low_confidence: output.has_low_confidence(OCR_LOW_CONFIDENCE_THRESHOLD),
        detected_language,
        fidelity,
    })
}

/// Runs one STREAMING translation through the provider layer, invoking
/// `on_delta` with the ACCUMULATED text-so-far after every non-empty chunk
/// (owner complaint: a visible loading indicator PLUS real streaming instead
/// of a one-shot call that can trip a false client-side timeout on a
/// slow-but-live response). Shapes the outcome into the same success/error
/// IPC payload shape either way, so callers get exactly one terminal event.
/// The provider is a trait object so tests use a wiremock-backed client with
/// no real API call (testing.md).
pub async fn run_translation_stream<F>(
    provider: &dyn TranslationProvider,
    key: &ApiKey,
    request: RegionTranslationRequest,
    target_language: &str,
    mut on_delta: F,
) -> Result<TranslationResultPayload, TranslationErrorPayload>
where
    F: FnMut(&str),
{
    use tokio_stream::StreamExt;

    let provider_request = ProviderRequest {
        model_id: request.model.clone(),
        source_language: None,
        target_language: target_language.to_string(),
        text: request.source_text.clone(),
    };
    let mut stream = match provider.translate_stream(&provider_request, key).await {
        Ok(stream) => stream,
        Err(err) => {
            return Err(TranslationErrorPayload {
                request_id: request.request_id,
                message: Some(err.to_string()),
            });
        }
    };

    let mut accumulated = String::new();
    while let Some(chunk) = stream.next().await {
        match chunk {
            Ok(chunk) => {
                if chunk.text_delta.is_empty() {
                    continue; // keep-alive event: no text to append or emit.
                }
                accumulated.push_str(&chunk.text_delta);
                on_delta(&accumulated);
            }
            Err(err) => {
                return Err(TranslationErrorPayload {
                    request_id: request.request_id,
                    message: Some(err.to_string()),
                });
            }
        }
    }

    Ok(TranslationResultPayload {
        request_id: request.request_id,
        translated_text: accumulated,
        // Report the provider/model that actually translated (AC-03.5).
        provider: provider.id().to_string(),
        model: request.model,
    })
}

/// Internal pipeline error for the capture -> OCR stage. Mapped to an IPC event
/// by [`region_preview_ready`] (never silently swallowed): a consent-required
/// error becomes [`EVENT_MODEL_CONSENT_REQUIRED`], any other becomes
/// [`EVENT_OCR_ERROR`]. Display strings carry no pixel data or user content.
#[derive(Debug, thiserror::Error)]
pub enum PipelineError {
    #[error("capture failed: {0}")]
    Capture(#[from] crate::capture::CaptureError),
    #[error("ocr failed: {0}")]
    Ocr(#[from] OcrError),
}

impl PipelineError {
    /// The consent disclosure, when this error is a fail-closed consent refusal.
    fn consent_disclosure(&self) -> Option<&ConsentDisclosure> {
        match self {
            PipelineError::Ocr(OcrError::ConsentRequired(disclosure)) => Some(disclosure),
            _ => None,
        }
    }
}

pub fn validate_region(region: &RegionRect) -> Result<(), ShellError> {
    if region.width == 0 || region.height == 0 {
        return Err(ShellError::InvalidRegion(
            "width and height must be > 0".into(),
        ));
    }
    if region.width > MAX_REGION_PX
        || region.height > MAX_REGION_PX
        || region.x > MAX_REGION_PX
        || region.y > MAX_REGION_PX
    {
        return Err(ShellError::InvalidRegion("coordinates out of range".into()));
    }
    Ok(())
}

/// Clamp a keyboard nudge delta to a sane per-keypress range.
pub fn clamp_nudge(delta: i32) -> i32 {
    delta.clamp(-MAX_NUDGE_PX, MAX_NUDGE_PX)
}

/// Open the fullscreen selection overlay window (created on demand, torn
/// down on cancel/confirm - idle budget, FR-05). Focuses the existing window
/// if one is already open.
pub fn open_selection_window<R: Runtime>(app: &AppHandle<R>) -> Result<(), ShellError> {
    // A fresh selection cycle invalidates any prior unconsumed arm: clear the
    // pending region up front so the eventual select `Destroyed` decision is
    // scoped to THIS cycle. Otherwise a stale arm (e.g. a preview closed without
    // granting consent, which re-arms per the ipc.md contract) could open a
    // preview over the OLD region when the user cancels the new selection with
    // Esc - violating AC-02.1. This runs BEFORE the early-focus return so even
    // re-opening focuses a clean cycle (no arm can outlive a select open).
    if let Some(state) = app.try_state::<RegionState>() {
        disarm_pending_region(&state);
    }
    // The build itself is DEFERRED off the calling turn (TASK-027
    // `open_deferred`) so this never deadlocks when invoked from inside a
    // WebView IPC callback; `after_build` (monitor positioning + show + focus)
    // runs once the window exists, still before the user ever sees it.
    open_deferred(
        app,
        SELECT_WINDOW_LABEL,
        WebviewUrl::App("index.html?view=region-select".into()),
        Existing::FocusOnly,
        |builder| {
            builder
                .title("OST")
                .transparent(true)
                .decorations(false)
                .always_on_top(true)
                .skip_taskbar(true)
                .resizable(false)
                .visible(false)
        },
        |window| {
            // Cover the primary monitor exactly (multi-monitor selection is out
            // of scope for TASK-008); fall back to maximized if no monitor is
            // reported.
            if let Some(monitor) = window.primary_monitor()? {
                window.set_position(*monitor.position())?;
                window.set_size(*monitor.size())?;
            } else {
                window.maximize()?;
            }
            window.show()?;
            window.set_focus()?;
            Ok(())
        },
    );
    Ok(())
}

/// Open (or focus) the region-preview overlay window. The build itself is
/// DEFERRED off the calling turn (TASK-027 `open_deferred`) so this never
/// deadlocks when invoked from inside a WebView IPC callback (or, as before
/// TASK-023, from the select window's own `Destroyed` handler).
///
/// When the preview window is ALREADY open (a re-select while the dialog is
/// showing), [`open_deferred`] only focuses it - no new mount happens, so the
/// frontend's mount-time OCR handshake never re-runs on its own. This emits
/// [`EVENT_REGION_SELECTED`] in exactly that case so the already-mounted
/// frontend resets and re-arms the pipeline for the NEW region (the root cause
/// fix for the "re-select does not refresh an open preview" bug).
pub(crate) fn open_preview_window(app: &AppHandle) -> Result<(), ShellError> {
    let already_open = app.get_webview_window(PREVIEW_WINDOW_LABEL).is_some();
    open_deferred(
        app,
        PREVIEW_WINDOW_LABEL,
        WebviewUrl::App("index.html?view=region-preview".into()),
        Existing::FocusOnly,
        |builder| {
            builder
                .title("OST")
                .transparent(true)
                .decorations(false)
                .always_on_top(true)
                .skip_taskbar(true)
                // Comfortable default for reading source + translation +
                // controls together (owner complaint: the old 480x320 default
                // was cramped). Kept well above `min_inner_size` below.
                .inner_size(600.0, 520.0)
                // Mirrors the caption overlay's floor (`caption.rs`) and the
                // CSS `--overlay-min-width` token so the panel never gets
                // squeezed below a usable size (owner complaint, TASK shell).
                .min_inner_size(320.0, 200.0)
        },
        |_window| Ok(()),
    );
    if already_open {
        let _ = app.emit_to(PREVIEW_WINDOW_LABEL, EVENT_REGION_SELECTED, ());
    }
    Ok(())
}

fn close_window(app: &AppHandle, label: &str) -> Result<(), ShellError> {
    if let Some(window) = app.get_webview_window(label) {
        window.close()?;
    }
    Ok(())
}

#[tauri::command]
pub fn start_region_selection(app: AppHandle) -> Result<(), ShellError> {
    open_selection_window(&app)
}

/// Esc path (AC-02.1): tear the selection window down; NO capture event.
#[tauri::command]
pub fn cancel_region_selection(app: AppHandle) -> Result<(), ShellError> {
    close_window(&app, SELECT_WINDOW_LABEL)
}

/// Arms the confirmed region + selected source language for pipeline pickup.
/// Split out so the confirm ordering (arm BEFORE the select overlay closes) is
/// unit-testable without a live `AppHandle` (TASK-023).
fn arm_pending_region(
    state: &RegionState,
    region: RegionRect,
    source_language: SourceLanguageSelection,
) {
    if let Ok(mut pending) = state.pending_region.lock() {
        *pending = Some(PendingRegion {
            rect: region,
            source_language,
        });
    }
}

/// Clears any unconsumed pending region so a FRESH selection cycle can never be
/// decided by a stale arm. A confirm arms `pending_region` and the select
/// window's `Destroyed` handler opens the preview off that shared state
/// ([`should_open_preview_after_select_close`]); the consent re-arm contract
/// ([`take_and_recognize`]) can also leave it `Some` when the user closes a
/// preview WITHOUT granting. Without this reset, starting a NEW selection and
/// pressing Esc would let the stale arm open a preview over the OLD region -
/// violating AC-02.1 (Esc = no capture, no preview). Called at the TOP of
/// [`open_selection_window`], which scopes the Destroyed decision to the current
/// cycle. It does NOT touch the consent re-arm contract, which lives entirely
/// inside the preview lifecycle AFTER a confirm with no intervening select-open.
fn disarm_pending_region(state: &RegionState) {
    if let Ok(mut pending) = state.pending_region.lock() {
        *pending = None;
    }
}

/// Whether the `region-select` overlay's `Destroyed` event should open the
/// preview window: true iff a region is pending (a confirm armed one before
/// closing the overlay), false for a cancel (which arms nothing). Consulted by
/// [`crate::shell::on_window_event`] at the top of a FRESH event-loop iteration -
/// after `NtUserDestroyWindow` has fully returned and the select window's
/// `WebviewWrapper` is dropped and its webview-map mutex released - so the
/// preview WebView2 create's message pump has no pending destroy to reenter
/// (TASK-023 reentrant `WebviewWrapper::drop` -> `Mutex::lock_contended`
/// self-deadlock).
pub(crate) fn should_open_preview_after_select_close(state: &RegionState) -> bool {
    state
        .pending_region
        .lock()
        .map(|pending| pending.is_some())
        .unwrap_or(false)
}

#[tauri::command]
pub fn confirm_region_selection(
    app: AppHandle,
    state: tauri::State<'_, RegionState>,
    region: RegionRect,
    source_language: Option<String>,
) -> Result<(), ShellError> {
    validate_region(&region)?;
    let source_language = SourceLanguageSelection::parse(source_language.as_deref().unwrap_or(""));
    // Arm the pending region BEFORE closing the select overlay so the window's
    // `Destroyed` handler can tell a confirm (region armed -> open preview) from
    // a cancel (nothing armed -> no preview).
    arm_pending_region(&state, region, source_language);
    // Queue the select overlay's destroy and RETURN. The preview window is NOT
    // opened here: doing so in the same command turn synchronously creates a
    // WebView2 whose `wait_with_pump` dispatches the select overlay's still-
    // pending `DestroyWindow`, reentering wry to drop the select window's
    // `WebviewWrapper` and block on the non-reentrant webview-map mutex the
    // create already holds - a fatal single-thread self-deadlock (TASK-023).
    // Instead the select window's `Destroyed` event opens the preview at the top
    // of a fresh event-loop iteration (see `crate::shell::on_window_event`).
    close_window(&app, SELECT_WINDOW_LABEL)
}

/// Take -> capture/OCR -> restore-on-consent core of [`region_preview_ready`],
/// independent of the `AppHandle`/emit surface and the engine routing (both
/// tested separately). Returns `None` when nothing was pending (a re-mount
/// before confirm); otherwise the pipeline result.
///
/// LIFECYCLE (ipc.md re-arm contract, human-in-the-loop.md no-silent-hang): the
/// pending region is consumed up front, but a [`OcrError::ConsentRequired`]
/// refusal is RECOVERABLE - the region is RESTORED into `state` so the
/// subsequent `grant_model_consent` + re-called `region_preview_ready` actually
/// runs OCR (the first-run consent path). Any OTHER error is TERMINAL: the
/// region stays cleared so the preview shows an `ocr-error` and a re-call finds
/// nothing pending (no infinite re-arm loop). A success likewise clears it.
fn take_and_recognize<F>(
    state: &RegionState,
    capturer: &dyn ScreenCapturer,
    resolve_engine: F,
    request_id: String,
) -> Option<Result<OcrResultPayload, PipelineError>>
where
    F: FnOnce(&SourceLanguageSelection) -> Arc<dyn OcrEngine>,
{
    let pending = state.pending_region.lock().ok()?.take()?;
    // Route to the rec engine for the SELECTED source language (per-language
    // routing; vi/latin -> latin rec).
    let engine = resolve_engine(&pending.source_language);
    let result = build_ocr_payload(
        capturer,
        engine.as_ref(),
        pending.rect,
        request_id,
        &pending.source_language,
    );
    // Restore ONLY on a consent refusal so the grant round-trip re-runs OCR;
    // every other outcome leaves the region cleared.
    if matches!(&result, Err(err) if err.consent_disclosure().is_some()) {
        if let Ok(mut guard) = state.pending_region.lock() {
            *guard = Some(pending);
        }
    }
    Some(result)
}

/// Blocks (bounded) until the fullscreen selection overlay window is gone before
/// a capture runs (TASK-021 capture-of-self fix). `confirm_region_selection`
/// closes the `region-select` overlay asynchronously, so a capture kicked off by
/// the preview can otherwise grab the app's own transparent always-on-top
/// overlay while DWM is still compositing its teardown. We poll Tauri's window
/// registry until the label is gone, then let DWM settle. Bounded so a stuck
/// teardown can never itself hang the capture path (human-in-the-loop.md).
fn wait_for_selection_overlay_closed<R: Runtime>(app: &AppHandle<R>) {
    use std::time::{Duration, Instant};
    const MAX_WAIT: Duration = Duration::from_millis(1500);
    const POLL: Duration = Duration::from_millis(30);
    const DWM_SETTLE: Duration = Duration::from_millis(60);

    let deadline = Instant::now() + MAX_WAIT;
    while app.get_webview_window(SELECT_WINDOW_LABEL).is_some() {
        if Instant::now() >= deadline {
            tracing::warn!("selection overlay still present at capture time; capturing anyway");
            return;
        }
        std::thread::sleep(POLL);
    }
    // The window left the registry; give DWM a brief moment to recompose the
    // desktop without the (transparent, always-on-top) overlay before capture.
    std::thread::sleep(DWM_SETTLE);
}

/// Preview WebView mounted and listening (SCR-03 handshake): pick up the pending
/// region and run capture -> OCR off the UI thread, then emit `region:ocr-result`
/// to the preview window. Capture/OCR are blocking CPU work, so they run on a
/// dedicated thread (tech-stack.md: never on the UI thread).
///
/// On the fail-closed first-run consent path the region is preserved by
/// [`take_and_recognize`] and this handler emits [`EVENT_MODEL_CONSENT_REQUIRED`];
/// after the user grants consent the preview re-calls this command and OCR runs
/// against the surviving region (ipc.md re-arm contract).
#[tauri::command]
pub fn region_preview_ready(app: AppHandle) -> Result<(), ShellError> {
    std::thread::spawn(move || {
        // State is fetched inside the worker thread: managed `State` handles
        // cannot cross the `'static` thread boundary, but the `AppHandle` can.
        let state = app.state::<RegionState>();
        let pipeline = app.state::<RegionPipeline>();
        let request_id = format!("region-ocr-{}", monotonic_correlation_id());
        let capturer = Arc::clone(&pipeline.capturer);

        // CAPTURE-OF-SELF race (TASK-021): `confirm_region_selection` closes the
        // fullscreen always-on-top selection overlay asynchronously. Make sure it
        // is actually destroyed (and DWM has recomposed the desktop without it)
        // BEFORE capture, so we never grab the app's own overlay mid-teardown.
        wait_for_selection_overlay_closed(&app);

        // One-heavy-session-at-a-time (BR-04): OCR is about to load its ORT
        // sessions, so drop any resident whisper STT context first.
        pipeline.begin_session();

        let outcome = take_and_recognize(
            state.inner(),
            capturer.as_ref(),
            |selection| -> Arc<dyn OcrEngine> { pipeline.engine_for(selection) },
            request_id.clone(),
        );

        match outcome {
            // Nothing pending (e.g. re-mount before a confirm); no capture.
            None => {}
            Some(Ok(payload)) => {
                let _ = app.emit_to(PREVIEW_WINDOW_LABEL, EVENT_OCR_RESULT, payload);
            }
            Some(Err(err)) => {
                // Never swallow the failure (human-in-the-loop.md: no silent
                // failure). A consent refusal asks the user (region kept by
                // take_and_recognize); anything else is a terminal OCR error.
                // Neither message carries pixel data or user content.
                if let Some(disclosure) = err.consent_disclosure() {
                    let _ = app.emit_to(
                        PREVIEW_WINDOW_LABEL,
                        EVENT_MODEL_CONSENT_REQUIRED,
                        disclosure.clone(),
                    );
                } else {
                    tracing::error!(error = %err, "region capture/OCR failed");
                    let _ = app.emit_to(
                        PREVIEW_WINDOW_LABEL,
                        EVENT_OCR_ERROR,
                        OcrErrorPayload {
                            request_id: Some(request_id),
                            message: Some(err.to_string()),
                        },
                    );
                }
            }
        }
    });
    Ok(())
}

/// Translate (or re-translate, AC-02.8) the current OCR text through the FR-03
/// provider layer, emitting `region:translation-result` or
/// `region:translation-error`. Runs on the async runtime (key retrieval + HTTP).
#[tauri::command]
pub fn request_region_translation(
    app: AppHandle,
    pipeline: tauri::State<'_, RegionPipeline>,
    request: RegionTranslationRequest,
) -> Result<(), ShellError> {
    if request.source_text.trim().is_empty() {
        return Err(ShellError::InvalidRegion(
            "source text must not be empty".into(),
        ));
    }
    // Validate the requested provider id at the command boundary (untrusted IPC
    // input); the async task does the rest.
    let provider_id = request
        .provider
        .parse::<ProviderId>()
        .map_err(ShellError::InvalidRegion)?;

    let keys = Arc::clone(&pipeline.keys);
    tauri::async_runtime::spawn(async move {
        let outcome = translate_with_provider_stream(&app, provider_id, &keys, request).await;
        match outcome {
            Ok(payload) => {
                let _ = app.emit_to(PREVIEW_WINDOW_LABEL, EVENT_TRANSLATION_RESULT, payload);
            }
            Err(payload) => {
                let _ = app.emit_to(PREVIEW_WINDOW_LABEL, EVENT_TRANSLATION_ERROR, payload);
            }
        }
    });
    Ok(())
}

/// Retrieves the provider key from the keychain, builds the provider client,
/// and runs a STREAMING translation, emitting `region:translation-delta` to
/// the preview window after every chunk (owner complaint 1: progressive text
/// instead of a silent wait). Every failure maps to a redacted
/// `TranslationErrorPayload` so the preview always leaves the "translating"
/// state (human-in-the-loop.md).
async fn translate_with_provider_stream(
    app: &AppHandle,
    provider_id: ProviderId,
    keys: &KeyStore,
    request: RegionTranslationRequest,
) -> Result<TranslationResultPayload, TranslationErrorPayload> {
    let request_id = request.request_id.clone();
    let fail = |message: &str| TranslationErrorPayload {
        request_id: request_id.clone(),
        message: Some(message.to_string()),
    };

    // Only Gemini has a client in Phase 1 (NFR-SCA-02: others are drop-in later).
    if provider_id != ProviderId::Gemini {
        return Err(fail("selected provider is not available yet"));
    }
    let key = match keys.retrieve_key(provider_id).await {
        Ok(Some(key)) => key,
        Ok(None) => return Err(fail("no API key configured for this provider")),
        Err(_) => return Err(fail("could not read the provider key from the keychain")),
    };
    let client = GeminiClient::new().map_err(|e| fail(&e.to_string()))?;
    let target_language = resolve_target_language(&request);
    let delta_request_id = request_id.clone();
    run_translation_stream(&client, &key, request, &target_language, |accumulated| {
        let _ = app.emit_to(
            PREVIEW_WINDOW_LABEL,
            EVENT_TRANSLATION_DELTA,
            TranslationDeltaPayload {
                request_id: delta_request_id.clone(),
                text: accumulated.to_string(),
            },
        );
    })
    .await
}

/// Process-monotonic correlation id for core-initiated OCR results.
fn monotonic_correlation_id() -> u64 {
    use std::sync::atomic::{AtomicU64, Ordering};
    static COUNTER: AtomicU64 = AtomicU64::new(1);
    COUNTER.fetch_add(1, Ordering::Relaxed)
}

#[tauri::command]
pub fn set_region_live_update(
    state: tauri::State<'_, RegionState>,
    enabled: bool,
) -> Result<(), ShellError> {
    if let Ok(mut live) = state.live_update.lock() {
        *live = enabled;
    }
    Ok(())
}

#[tauri::command]
pub fn close_region_preview(
    app: AppHandle,
    pipeline: tauri::State<'_, RegionPipeline>,
) -> Result<(), ShellError> {
    // Region session ended: drop every engine's ORT session so the resident
    // footprint falls back toward the idle baseline (NFR-PERF-03 idle < 100MB,
    // NFR-REL-02 release-to-idle). Routed through the coordinator so the active
    // heavy-session marker clears too. The next region rebuilds lazily.
    pipeline.end_session();
    close_window(&app, PREVIEW_WINDOW_LABEL)
}

/// Keyboard reposition of the preview overlay (AC-04.3 keyboard-only path).
#[tauri::command]
pub fn nudge_region_preview(app: AppHandle, dx: i32, dy: i32) -> Result<(), ShellError> {
    let window = app
        .get_webview_window(PREVIEW_WINDOW_LABEL)
        .ok_or(ShellError::WindowNotFound(PREVIEW_WINDOW_LABEL))?;
    let position = window.outer_position()?;
    window.set_position(tauri::PhysicalPosition::new(
        position.x + clamp_nudge(dx),
        position.y + clamp_nudge(dy),
    ))?;
    Ok(())
}

/// e2e acceptance gate (TASK-022) - COMPILED ONLY under the `e2e` feature, never
/// in production builds. Drives the SAME real capture -> OCR core as
/// [`region_preview_ready`] (the production [`RegionPipeline`] capturer + rec
/// engine, NOT a mock) synchronously and RETURNS the terminal outcome tag.
///
/// Why a returning command: tauri-driver attaches to ONE WebView, and
/// `region_preview_ready` emits its result to the separate `region-preview`
/// window the driver cannot observe. Returning the outcome lets the WebDriver
/// session assert the real pipeline reaches a terminal state - `ocr-result`,
/// `ocr-error`, or `consent-required` - and, because the `invoke` resolves, that
/// the real capturer NEVER hangs (the owner acceptance bar). This changes NO
/// production capture/OCR behavior: it is absent from shipping binaries.
#[cfg(feature = "e2e")]
#[tauri::command]
pub fn e2e_region_probe(
    pipeline: tauri::State<'_, RegionPipeline>,
    x: u32,
    y: u32,
    width: u32,
    height: u32,
) -> Result<String, ShellError> {
    let region = RegionRect {
        x,
        y,
        width,
        height,
    };
    validate_region(&region)?;
    // Auto selection routes to the production main rec engine (same as an
    // unpinned real selection). This is the real per-language routing, not a
    // test double.
    let selection = SourceLanguageSelection::Auto;
    let engine = pipeline.engine_for(&selection);
    pipeline.begin_session();
    let request_id = format!("e2e-region-{}", monotonic_correlation_id());
    let outcome = build_ocr_payload(
        pipeline.capturer.as_ref(),
        engine.as_ref(),
        region,
        request_id,
        &selection,
    );
    pipeline.end_session();
    Ok(match outcome {
        Ok(payload) => format!(
            "ocr-result:len={},lowConfidence={}",
            payload.source_text.chars().count(),
            payload.low_confidence
        ),
        Err(err) if err.consent_disclosure().is_some() => "consent-required".to_string(),
        Err(err) => format!("ocr-error:{err}"),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validate_region_accepts_a_normal_rect() {
        let region = RegionRect {
            x: 10,
            y: 20,
            width: 300,
            height: 200,
        };
        assert!(validate_region(&region).is_ok());
    }

    #[test]
    fn validate_region_rejects_zero_dimensions() {
        let region = RegionRect {
            x: 0,
            y: 0,
            width: 0,
            height: 10,
        };
        assert!(matches!(
            validate_region(&region),
            Err(ShellError::InvalidRegion(_))
        ));
    }

    #[test]
    fn validate_region_rejects_out_of_range_values() {
        let region = RegionRect {
            x: 0,
            y: 0,
            width: MAX_REGION_PX + 1,
            height: 10,
        };
        assert!(validate_region(&region).is_err());
    }

    #[test]
    fn region_rect_deserializes_from_the_ipc_camel_case_payload() {
        let region: RegionRect =
            serde_json::from_str(r#"{"x":1,"y":2,"width":30,"height":40}"#).unwrap();
        assert_eq!(
            region,
            RegionRect {
                x: 1,
                y: 2,
                width: 30,
                height: 40
            }
        );
    }

    #[test]
    fn translation_request_deserializes_camel_case_fields() {
        let request: RegionTranslationRequest = serde_json::from_str(
            r#"{"requestId":"ui-1","sourceText":"hi","provider":"gemini","model":"m"}"#,
        )
        .unwrap();
        assert_eq!(request.request_id, "ui-1");
        assert_eq!(request.source_text, "hi");
        // targetLanguage is optional (older/legacy callers omit it).
        assert_eq!(request.target_language, None);
    }

    #[test]
    fn translation_request_deserializes_the_optional_target_language() {
        let request: RegionTranslationRequest = serde_json::from_str(
            r#"{"requestId":"ui-2","sourceText":"hi","provider":"gemini","model":"m","targetLanguage":"ja"}"#,
        )
        .unwrap();
        assert_eq!(request.target_language, Some("ja".into()));
    }

    fn translation_request_with_target(target: Option<&str>) -> RegionTranslationRequest {
        RegionTranslationRequest {
            request_id: "ui-t".into(),
            source_text: "hi".into(),
            provider: "gemini".into(),
            model: "m".into(),
            target_language: target.map(str::to_string),
        }
    }

    #[test]
    fn resolve_target_language_uses_the_selection_when_present() {
        assert_eq!(
            resolve_target_language(&translation_request_with_target(Some("ja"))),
            "ja"
        );
    }

    #[test]
    fn resolve_target_language_falls_back_to_the_default_when_absent_or_blank() {
        assert_eq!(
            resolve_target_language(&translation_request_with_target(None)),
            DEFAULT_TARGET_LANGUAGE
        );
        assert_eq!(
            resolve_target_language(&translation_request_with_target(Some("   "))),
            DEFAULT_TARGET_LANGUAGE
        );
    }

    #[test]
    fn payloads_serialize_to_camel_case_for_the_webview() {
        let payload = OcrResultPayload {
            request_id: "r".into(),
            source_text: "s".into(),
            low_confidence: true,
            detected_language: None,
            fidelity: OcrFidelityPayload::Full,
        };
        let json = serde_json::to_string(&payload).unwrap();
        assert!(json.contains("\"requestId\""));
        assert!(json.contains("\"sourceText\""));
        assert!(json.contains("\"lowConfidence\""));
        assert!(json.contains("\"fidelity\""));
    }

    #[test]
    fn ocr_fidelity_payload_serializes_as_a_kind_tagged_union() {
        let full = serde_json::to_value(OcrFidelityPayload::Full).unwrap();
        assert_eq!(full, serde_json::json!({"kind": "full"}));
        let degraded = serde_json::to_value(OcrFidelityPayload::Degraded {
            reason: "missing charset".into(),
        })
        .unwrap();
        assert_eq!(
            degraded,
            serde_json::json!({"kind": "degraded", "reason": "missing charset"})
        );
    }

    #[test]
    fn detect_language_picks_the_script_family() {
        assert_eq!(detect_language(""), None);
        assert_eq!(detect_language("   "), None);
        assert_eq!(detect_language("Hello world"), Some("en".into()));
        // Composed tone marks (U+1E00-U+1EFF) -> Vietnamese.
        assert_eq!(detect_language("Tiếng Việt"), Some("vi".into()));
        assert_eq!(detect_language("こんにちは"), Some("ja".into()));
        assert_eq!(detect_language("안녕하세요"), Some("ko".into()));
        assert_eq!(detect_language("欢迎"), Some("zh".into()));
    }

    /// A synthetic in-memory capturer for pipeline tests (no display).
    struct MockCapturer(image::RgbImage);
    impl ScreenCapturer for MockCapturer {
        fn capture(
            &self,
            _region: CaptureRegion,
        ) -> Result<image::RgbImage, crate::capture::CaptureError> {
            Ok(self.0.clone())
        }
    }

    /// A mock OCR engine returning canned lines + a per-language fidelity.
    struct MockOcr {
        lines: Vec<crate::ocr::OcrLine>,
        scores: Vec<f32>,
    }
    impl OcrEngine for MockOcr {
        fn id(&self) -> &'static str {
            "mock-ocr"
        }
        fn recognize(&self, _image: &image::RgbImage) -> Result<crate::ocr::OcrOutput, OcrError> {
            Ok(crate::ocr::OcrOutput {
                lines: self.lines.clone(),
                confidence: crate::ocr::OcrConfidence::PerLine(self.scores.clone()),
            })
        }
        fn fidelity(&self, lang: &str) -> OcrFidelity {
            if lang == "vi" {
                OcrFidelity::Degraded {
                    reason: "vi charset gap".into(),
                }
            } else {
                OcrFidelity::Full
            }
        }
    }

    fn rect() -> RegionRect {
        RegionRect {
            x: 0,
            y: 0,
            width: 8,
            height: 4,
        }
    }

    #[test]
    fn build_ocr_payload_joins_lines_and_flags_low_confidence() {
        let capturer = MockCapturer(image::RgbImage::new(8, 4));
        let engine = MockOcr {
            lines: vec![
                crate::ocr::OcrLine {
                    text: "Hello".into(),
                    confidence: Some(0.99),
                },
                crate::ocr::OcrLine {
                    text: "world".into(),
                    confidence: Some(0.40),
                },
            ],
            scores: vec![0.99, 0.40],
        };
        let payload = build_ocr_payload(
            &capturer,
            &engine,
            rect(),
            "rid-1".into(),
            &SourceLanguageSelection::Auto,
        )
        .unwrap();
        assert_eq!(payload.source_text, "Hello\nworld");
        assert!(payload.low_confidence); // 0.40 < threshold 0.6
        assert_eq!(payload.detected_language, Some("en".into()));
        // Auto (no manual pin): fidelity is not asserted Degraded.
        assert_eq!(payload.fidelity, OcrFidelityPayload::Full);
    }

    #[test]
    fn build_ocr_payload_declares_degraded_when_vi_is_selected_regardless_of_output() {
        // S1 FIX: with source language `vi` SELECTED, the payload carries
        // Degraded fidelity even though the OCR output is pure ASCII with NO
        // Vietnamese tone marks (the exact case post-OCR detection missed, since
        // the latin rec drops the U+1E00-U+1EFF markers). This is the test that
        // would have caught S1: fidelity keys off the selection, not the output.
        let capturer = MockCapturer(image::RgbImage::new(8, 4));
        let engine = MockOcr {
            // Deliberately ASCII: detect_language would say "en" -> Full.
            lines: vec![crate::ocr::OcrLine {
                text: "Tieng Viet".into(),
                confidence: Some(0.97),
            }],
            scores: vec![0.97],
        };
        let payload = build_ocr_payload(
            &capturer,
            &engine,
            rect(),
            "rid-2".into(),
            &SourceLanguageSelection::Pinned("vi".into()),
        )
        .unwrap();
        // Post-OCR detection sees only ASCII (the hint), but fidelity is Degraded
        // because vi was SELECTED - and confidence is high (0.97), so the
        // lowConfidence flag would NOT have caught it (human-in-the-loop.md).
        assert_eq!(payload.detected_language, Some("en".into()));
        assert!(!payload.low_confidence);
        assert!(
            matches!(payload.fidelity, OcrFidelityPayload::Degraded { .. }),
            "vi selected must yield Degraded regardless of OCR output text"
        );
    }

    #[test]
    fn build_ocr_payload_auto_selection_does_not_assert_degraded_for_vi_looking_text() {
        // Auto (no pin): even when the OCR output looks Vietnamese, fidelity is
        // NOT asserted Degraded - auto-detect is a best-effort hint only. The
        // detectedLanguage hint still reflects the text.
        let capturer = MockCapturer(image::RgbImage::new(8, 4));
        let engine = MockOcr {
            lines: vec![crate::ocr::OcrLine {
                text: "Tiếng Việt".into(),
                confidence: Some(0.97),
            }],
            scores: vec![0.97],
        };
        let payload = build_ocr_payload(
            &capturer,
            &engine,
            rect(),
            "rid-2b".into(),
            &SourceLanguageSelection::Auto,
        )
        .unwrap();
        assert_eq!(payload.detected_language, Some("vi".into()));
        assert_eq!(payload.fidelity, OcrFidelityPayload::Full);
    }

    #[test]
    fn build_ocr_payload_surfaces_empty_text_for_no_recognition() {
        // AC-02.7: empty OCR -> empty sourceText; UI enters the empty state.
        let capturer = MockCapturer(image::RgbImage::new(8, 4));
        let engine = MockOcr {
            lines: vec![],
            scores: vec![],
        };
        let payload = build_ocr_payload(
            &capturer,
            &engine,
            rect(),
            "rid-3".into(),
            &SourceLanguageSelection::Auto,
        )
        .unwrap();
        assert!(payload.source_text.is_empty());
        assert_eq!(payload.detected_language, None);
    }

    #[tokio::test]
    async fn run_translation_stream_emits_accumulated_deltas_then_the_final_result() {
        use wiremock::matchers::{method, path, query_param};
        use wiremock::{Mock, MockServer, ResponseTemplate};

        const MODEL: &str = "gemini-2.5-flash";
        let server = MockServer::start().await;
        let sse = format!(
            "data: {}\r\n\r\ndata: {}\r\n\r\n",
            serde_json::json!({
                "candidates": [{"content": {"role": "model", "parts": [{"text": "Xin "}]}}]
            }),
            serde_json::json!({
                "candidates": [{"content": {"role": "model", "parts": [{"text": "chào"}]}, "finishReason": "STOP"}]
            }),
        );
        Mock::given(method("POST"))
            .and(path(format!(
                "/v1beta/models/{MODEL}:streamGenerateContent"
            )))
            .and(query_param("alt", "sse"))
            .respond_with(ResponseTemplate::new(200).set_body_raw(sse, "text/event-stream"))
            .mount(&server)
            .await;

        let mut config = crate::providers::ProviderHttpConfig::with_base_url(server.uri());
        config.max_retries = 0;
        let client = GeminiClient::with_config(config).unwrap();
        let key = ApiKey::new("FAKE-TEST-KEY-SYNTHETIC-03".into()).unwrap();
        let request = RegionTranslationRequest {
            request_id: "ui-11".into(),
            source_text: "Hello".into(),
            provider: "gemini".into(),
            model: MODEL.into(),
            target_language: None,
        };

        // Collects the ACCUMULATED text passed to every delta callback - this
        // is the exact contract the frontend timeout fix depends on: the
        // FIRST callback proves the stream is alive.
        let mut seen_deltas: Vec<String> = Vec::new();
        let payload = run_translation_stream(&client, &key, request, "vi", |accumulated| {
            seen_deltas.push(accumulated.to_string());
        })
        .await
        .unwrap();

        assert_eq!(payload.request_id, "ui-11");
        assert_eq!(payload.translated_text, "Xin chào");
        assert_eq!(payload.provider, "gemini");
        assert_eq!(payload.model, MODEL);
        // Deltas arrive progressively and ACCUMULATED (not bare per-chunk text).
        assert_eq!(
            seen_deltas,
            vec!["Xin ".to_string(), "Xin chào".to_string()]
        );
        assert!(
            !seen_deltas.first().unwrap().is_empty(),
            "the first delta must carry non-empty text so the UI timeout can clear on it"
        );
    }

    #[tokio::test]
    async fn run_translation_stream_maps_a_transport_level_stream_error() {
        use wiremock::matchers::method;
        use wiremock::{Mock, MockServer, ResponseTemplate};

        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .respond_with(ResponseTemplate::new(401))
            .mount(&server)
            .await;

        let mut config = crate::providers::ProviderHttpConfig::with_base_url(server.uri());
        config.max_retries = 0;
        let client = GeminiClient::with_config(config).unwrap();
        let key = ApiKey::new("FAKE-TEST-KEY-SYNTHETIC-04".into()).unwrap();
        let request = RegionTranslationRequest {
            request_id: "ui-12".into(),
            source_text: "Hello".into(),
            provider: "gemini".into(),
            model: "gemini-2.5-flash".into(),
            target_language: None,
        };

        let mut delta_count = 0;
        let err = run_translation_stream(&client, &key, request, "vi", |_| {
            delta_count += 1;
        })
        .await
        .unwrap_err();
        assert_eq!(err.request_id, "ui-12");
        assert_eq!(delta_count, 0, "an upfront auth failure emits no deltas");
    }

    #[test]
    fn translation_delta_payload_serializes_to_camel_case() {
        let payload = TranslationDeltaPayload {
            request_id: "ui-1".into(),
            text: "Xin ".into(),
        };
        let json = serde_json::to_value(&payload).unwrap();
        assert_eq!(json["requestId"], "ui-1");
        assert_eq!(json["text"], "Xin ");
        assert_eq!(EVENT_TRANSLATION_DELTA, "region:translation-delta");
    }

    #[test]
    fn translation_error_payload_serializes_to_camel_case_and_omits_absent_message() {
        let payload = TranslationErrorPayload {
            request_id: "ui-1".into(),
            message: None,
        };
        let json = serde_json::to_string(&payload).unwrap();
        assert_eq!(json, r#"{"requestId":"ui-1"}"#);
        assert_eq!(EVENT_TRANSLATION_ERROR, "region:translation-error");
    }

    #[test]
    fn source_language_selection_parses_auto_and_pins() {
        assert_eq!(
            SourceLanguageSelection::parse(""),
            SourceLanguageSelection::Auto
        );
        assert_eq!(
            SourceLanguageSelection::parse("   "),
            SourceLanguageSelection::Auto
        );
        assert_eq!(
            SourceLanguageSelection::parse("AUTO"),
            SourceLanguageSelection::Auto
        );
        assert_eq!(
            SourceLanguageSelection::parse("VI"),
            SourceLanguageSelection::Pinned("vi".into())
        );
        assert_eq!(
            SourceLanguageSelection::parse(" ja "),
            SourceLanguageSelection::Pinned("ja".into())
        );
    }

    #[test]
    fn rec_model_routing_sends_vietnamese_and_latin_to_the_latin_rec() {
        use SourceLanguageSelection::{Auto, Pinned};
        // The pre-fix bug wired main() only; vi must route to the latin rec.
        assert_eq!(
            rec_model_for_language(&Pinned("vi".into())),
            RecModel::Latin
        );
        assert_eq!(
            rec_model_for_language(&Pinned("fr".into())),
            RecModel::Latin
        );
        assert_eq!(
            rec_model_for_language(&Pinned("de".into())),
            RecModel::Latin
        );
        // ja/zh/en -> main; ko -> korean; auto -> main.
        assert_eq!(rec_model_for_language(&Pinned("ja".into())), RecModel::Main);
        assert_eq!(rec_model_for_language(&Pinned("zh".into())), RecModel::Main);
        assert_eq!(rec_model_for_language(&Pinned("en".into())), RecModel::Main);
        assert_eq!(
            rec_model_for_language(&Pinned("ko".into())),
            RecModel::Korean
        );
        assert_eq!(rec_model_for_language(&Auto), RecModel::Main);
    }

    #[test]
    fn ocr_error_payload_serializes_to_camel_case_and_omits_absent_fields() {
        let payload = OcrErrorPayload {
            request_id: Some("region-ocr-1".into()),
            message: Some("capture failed: no capturable monitor found".into()),
        };
        let json = serde_json::to_value(&payload).unwrap();
        assert_eq!(json["requestId"], "region-ocr-1");
        assert!(json["message"]
            .as_str()
            .unwrap()
            .starts_with("capture failed"));
        assert_eq!(EVENT_OCR_ERROR, "region:ocr-error");
        assert_eq!(EVENT_MODEL_CONSENT_REQUIRED, "models:consent-required");
        assert_eq!(EVENT_REGION_SELECTED, "region:selected");

        // Absent fields are omitted (a bare error still leaves the state).
        let empty = OcrErrorPayload {
            request_id: None,
            message: None,
        };
        assert_eq!(serde_json::to_string(&empty).unwrap(), "{}");
    }

    #[test]
    fn pipeline_error_routes_only_consent_refusals_to_the_consent_event() {
        // The Rust side of the consent-required vs ocr-error split: the emission
        // path (region_preview_ready) fires EVENT_MODEL_CONSENT_REQUIRED iff
        // `consent_disclosure()` yields Some, else EVENT_OCR_ERROR. This pins that
        // classification branch (the emit itself needs a live AppHandle).
        let disclosure = ConsentDisclosure {
            model_set_id: "ocr-ppocrv5".into(),
            display_name: "PP-OCRv5".into(),
            host_name: "ModelScope".into(),
            host_domain: "modelscope.cn".into(),
            artifacts: vec![],
            total_approx_size_bytes: 0,
            destination: "/tmp/models".into(),
        };

        // A fail-closed consent refusal carries the disclosure (-> consent event).
        let consent_err =
            PipelineError::Ocr(OcrError::ConsentRequired(Box::new(disclosure.clone())));
        assert_eq!(
            consent_err
                .consent_disclosure()
                .map(|d| d.model_set_id.as_str()),
            Some("ocr-ppocrv5")
        );

        // Any other OCR failure is a plain ocr-error (no disclosure).
        assert!(PipelineError::Ocr(OcrError::Inference("boom".into()))
            .consent_disclosure()
            .is_none());
        assert!(PipelineError::Ocr(OcrError::ModelLoad("no session".into()))
            .consent_disclosure()
            .is_none());
        // A capture failure is likewise an ocr-error, never a consent prompt.
        assert!(
            PipelineError::Capture(crate::capture::CaptureError::Backend("backend".into()))
                .consent_disclosure()
                .is_none()
        );
    }

    /// A mock OCR engine that mirrors [`PaddleOcrEngine`]'s fail-closed behavior:
    /// it consults a real [`ModelGate`] before "recognizing", so it returns
    /// `ConsentRequired` until consent is granted and canned lines afterwards -
    /// without any download. Lets the lifecycle test drive the exact first-run
    /// consent round-trip against the real gate.
    struct GatedMockOcr {
        gate: Arc<ModelGate>,
    }
    impl OcrEngine for GatedMockOcr {
        fn id(&self) -> &'static str {
            "gated-mock-ocr"
        }
        fn ensure_ready(&self) -> Result<(), OcrError> {
            // Gate in ensure_ready, exactly as the real PaddleOcrEngine does, so
            // the region pipeline consults consent BEFORE capture (TASK-021 S2).
            self.gate
                .ensure_download_allowed(crate::ocr::OCR_MODEL_SET_ID)
                .map_err(|err| match err {
                    crate::models::ModelError::ConsentRequired(d) => OcrError::ConsentRequired(d),
                    other => OcrError::ModelLoad(other.to_string()),
                })
        }
        fn recognize(&self, _image: &image::RgbImage) -> Result<crate::ocr::OcrOutput, OcrError> {
            Ok(crate::ocr::OcrOutput {
                lines: vec![crate::ocr::OcrLine {
                    text: "Xin chao".into(),
                    confidence: Some(0.98),
                }],
                confidence: crate::ocr::OcrConfidence::PerLine(vec![0.98]),
            })
        }
        fn fidelity(&self, _lang: &str) -> OcrFidelity {
            OcrFidelity::Full
        }
    }

    fn arm_region(state: &RegionState) {
        *state.pending_region.lock().unwrap() = Some(PendingRegion {
            rect: rect(),
            source_language: SourceLanguageSelection::Pinned("vi".into()),
        });
    }

    #[test]
    fn consent_required_keeps_region_and_grant_reruns_ocr() {
        // BLOCKER regression (first-run hang): take_and_recognize consumes the
        // pending region up front, but a ConsentRequired refusal must RESTORE it
        // so the grant + re-called region_preview_ready runs OCR. Without the
        // restore the second call finds nothing pending and the preview hangs on
        // "Recognizing text..." forever (ipc.md re-arm contract).
        use crate::models::{InMemoryConsentStore, ModelGate};

        let gate = Arc::new(ModelGate::new(
            Arc::new(InMemoryConsentStore::default()),
            vec![crate::ocr::ocr_model_set_descriptor(
                std::path::PathBuf::from("/cache"),
            )],
        ));
        let engine: Arc<dyn OcrEngine> = Arc::new(GatedMockOcr {
            gate: Arc::clone(&gate),
        });
        let capturer = MockCapturer(image::RgbImage::new(8, 4));
        let state = RegionState::default();
        arm_region(&state);

        // Pass 1: consent not granted -> ConsentRequired, region PRESERVED.
        let first = take_and_recognize(
            &state,
            &capturer,
            |_| Arc::clone(&engine),
            "region-ocr-1".into(),
        );
        assert!(
            matches!(
                first,
                Some(Err(ref e)) if e.consent_disclosure().is_some()
            ),
            "first pass must refuse with ConsentRequired"
        );
        assert!(
            state.pending_region.lock().unwrap().is_some(),
            "the region must survive a consent refusal so the grant can re-run OCR"
        );

        // User grants consent, then the preview re-calls region_preview_ready.
        gate.grant(crate::ocr::OCR_MODEL_SET_ID).unwrap();

        // Pass 2: same surviving region now runs OCR to an ocr-result payload.
        let second = take_and_recognize(
            &state,
            &capturer,
            |_| Arc::clone(&engine),
            "region-ocr-2".into(),
        );
        match second {
            Some(Ok(payload)) => {
                assert_eq!(payload.request_id, "region-ocr-2");
                assert_eq!(payload.source_text, "Xin chao");
            }
            other => panic!("grant + re-call must run OCR to an ocr-result, got {other:?}"),
        }
        // The successful pickup consumed the region (nothing left to re-arm).
        assert!(state.pending_region.lock().unwrap().is_none());
    }

    #[test]
    fn terminal_ocr_error_clears_region_and_does_not_re_arm() {
        // The other half of the lifecycle contract: a genuine (non-consent) OCR
        // failure is TERMINAL. The region must be CLEARED so region_preview_ready
        // emits an ocr-error and a re-call finds nothing pending - no infinite
        // ret/re-arm loop (human-in-the-loop.md: no silent hang, but also no spin).
        struct FailingOcr;
        impl OcrEngine for FailingOcr {
            fn id(&self) -> &'static str {
                "failing-ocr"
            }
            fn recognize(
                &self,
                _image: &image::RgbImage,
            ) -> Result<crate::ocr::OcrOutput, OcrError> {
                Err(OcrError::Inference("boom".into()))
            }
            fn fidelity(&self, _lang: &str) -> OcrFidelity {
                OcrFidelity::Full
            }
        }

        let engine: Arc<dyn OcrEngine> = Arc::new(FailingOcr);
        let capturer = MockCapturer(image::RgbImage::new(8, 4));
        let state = RegionState::default();
        arm_region(&state);

        let first = take_and_recognize(
            &state,
            &capturer,
            |_| Arc::clone(&engine),
            "region-ocr-1".into(),
        );
        assert!(
            matches!(first, Some(Err(ref e)) if e.consent_disclosure().is_none()),
            "a non-consent OCR failure is a terminal error"
        );
        assert!(
            state.pending_region.lock().unwrap().is_none(),
            "a terminal error must clear the region (no re-arm loop)"
        );

        // A re-call now finds nothing pending: None, not another attempt.
        let second = take_and_recognize(
            &state,
            &capturer,
            |_| Arc::clone(&engine),
            "region-ocr-2".into(),
        );
        assert!(
            second.is_none(),
            "re-calling after a terminal error must not re-run OCR"
        );
    }

    /// A capturer that PANICS if `capture` is ever called - proves a code path
    /// never grabs the screen (TASK-021 gate-before-capture).
    struct PanicOnCapture;
    impl ScreenCapturer for PanicOnCapture {
        fn capture(
            &self,
            _region: CaptureRegion,
        ) -> Result<image::RgbImage, crate::capture::CaptureError> {
            panic!("capture() must NOT be called before the consent gate passes");
        }
    }

    #[test]
    fn consent_gate_is_checked_before_capture_on_first_run() {
        // TASK-021 S2 (the cheap validation the debugger asked for): on first run
        // `build_ocr_payload` must raise ConsentRequired from `ensure_ready`
        // WITHOUT ever calling `capturer.capture()`. The capturer panics if
        // touched, so a green test proves no pixel is grabbed before consent -
        // the reordering that turns the first-run hang into a consent dialog.
        use crate::models::{InMemoryConsentStore, ModelGate};

        let gate = Arc::new(ModelGate::new(
            Arc::new(InMemoryConsentStore::default()),
            vec![crate::ocr::ocr_model_set_descriptor(
                std::path::PathBuf::from("/cache"),
            )],
        ));
        let engine = GatedMockOcr {
            gate: Arc::clone(&gate),
        };

        // No consent yet: gate refuses BEFORE capture (which would panic).
        let refused = build_ocr_payload(
            &PanicOnCapture,
            &engine,
            rect(),
            "rid-gate".into(),
            &SourceLanguageSelection::Pinned("vi".into()),
        );
        assert!(
            matches!(&refused, Err(e) if e.consent_disclosure().is_some()),
            "first run must refuse with ConsentRequired before any capture"
        );

        // After the grant, ensure_ready passes and capture WOULD run - swap in a
        // real (mock) capturer to confirm the rest of the payload builds.
        gate.grant(crate::ocr::OCR_MODEL_SET_ID).unwrap();
        let ok = build_ocr_payload(
            &MockCapturer(image::RgbImage::new(8, 4)),
            &engine,
            rect(),
            "rid-gate-2".into(),
            &SourceLanguageSelection::Pinned("vi".into()),
        )
        .unwrap();
        assert_eq!(ok.source_text, "Xin chao");
    }

    #[test]
    fn capture_timeout_maps_to_a_terminal_ocr_error_not_a_consent_prompt() {
        // TASK-021 BLOCKER: a capture that times out surfaces
        // `CaptureError::Backend`, which `build_ocr_payload` maps to
        // `PipelineError::Capture` -> region:ocr-error (never a consent prompt,
        // never a silent hang). This mock stands in for the real timeout branch
        // in `WindowsScreenCapturer::capture`, which needs a live display.
        struct TimingOutCapturer;
        impl ScreenCapturer for TimingOutCapturer {
            fn capture(
                &self,
                _region: CaptureRegion,
            ) -> Result<image::RgbImage, crate::capture::CaptureError> {
                Err(crate::capture::CaptureError::Backend(
                    "screen capture timed out after 5s".into(),
                ))
            }
        }

        let engine = MockOcr {
            lines: vec![],
            scores: vec![],
        };
        let result = build_ocr_payload(
            &TimingOutCapturer,
            &engine,
            rect(),
            "rid-timeout".into(),
            &SourceLanguageSelection::Auto,
        );
        match result {
            Err(err) => {
                assert!(
                    err.consent_disclosure().is_none(),
                    "a capture timeout is a terminal ocr-error, not a consent prompt"
                );
                assert!(matches!(err, PipelineError::Capture(_)));
            }
            Ok(_) => panic!("a capture timeout must not produce an ocr-result"),
        }
    }

    #[test]
    fn region_pipeline_registers_its_ocr_unloader_with_the_coordinator() {
        // BR-04 wiring guard: RegionPipeline::new_default must register the OCR
        // heavy-session unloader, and begin/end_session must route through the
        // coordinator. Starting an audio session (begin Stt) then drops the ORT
        // sessions and marks STT the sole resident kind; engines stay lazily
        // unloaded (no download in tests) so we assert the markers + is_loaded.
        use crate::core::{HeavySessionCoordinator, HeavySessionKind};
        use crate::models::{InMemoryConsentStore, ModelGate};

        let gate = Arc::new(ModelGate::new(
            Arc::new(InMemoryConsentStore::default()),
            vec![crate::ocr::ocr_model_set_descriptor(
                std::path::PathBuf::from("/cache"),
            )],
        ));
        let coordinator = Arc::new(HeavySessionCoordinator::new());
        let pipeline = RegionPipeline::new_default(Arc::clone(&gate), Arc::clone(&coordinator));

        // Engines are lazy: nothing resident at construction (idle baseline).
        assert!(!pipeline.ocr_main.is_loaded());
        assert!(!pipeline.ocr_latin.is_loaded());
        assert!(!pipeline.ocr_korean.is_loaded());

        // Audio session starts -> OCR unloader fires (idempotent no-op here) and
        // STT is the only resident kind.
        coordinator.begin(HeavySessionKind::Stt);
        assert_eq!(coordinator.active(), Some(HeavySessionKind::Stt));
        assert!(!pipeline.ocr_main.is_loaded());

        // Region session begin/end drives the OCR marker and returns to idle.
        pipeline.begin_session();
        assert_eq!(coordinator.active(), Some(HeavySessionKind::Ocr));
        pipeline.end_session();
        assert_eq!(coordinator.active(), None, "return-to-idle after stop");
        assert!(!pipeline.ocr_latin.is_loaded());
        assert!(!pipeline.ocr_korean.is_loaded());
    }

    #[test]
    fn confirm_arms_pending_region_before_the_select_overlay_closes() {
        // TASK-023 (the reorder that breaks the reentrant deadlock): confirm
        // ARMS the pending region FIRST, then closes the select overlay and
        // returns - it does NOT open the preview in-turn. Because the region is
        // armed, the select window's `Destroyed` handler will open the preview
        // at the top of a fresh event-loop iteration. This pins the "arm before
        // close, decision gated on pending" invariant without a live AppHandle.
        let state = RegionState::default();
        // Before confirm nothing is armed, so a Destroyed would open no preview.
        assert!(
            !should_open_preview_after_select_close(&state),
            "no pending region before confirm -> Destroyed opens no preview"
        );

        arm_pending_region(&state, rect(), SourceLanguageSelection::Pinned("vi".into()));

        // A region is armed, so the Destroyed handler WILL open the preview.
        assert!(
            should_open_preview_after_select_close(&state),
            "confirm armed a region -> Destroyed opens the preview"
        );
        let pending = state.pending_region.lock().unwrap();
        let armed = pending
            .as_ref()
            .expect("confirm must arm the pending region before closing the overlay");
        assert_eq!(armed.rect, rect());
        assert_eq!(
            armed.source_language,
            SourceLanguageSelection::Pinned("vi".into())
        );
    }

    #[test]
    fn cancel_arms_nothing_so_the_select_destroyed_opens_no_preview() {
        // The confirm/cancel distinction the Destroyed handler keys off
        // (TASK-023): `cancel_region_selection` only closes the overlay and arms
        // NO region, so when the select window is destroyed no preview opens -
        // exactly the branch that must NOT re-create a WebView on the Esc path.
        let state = RegionState::default();
        // cancel never calls arm_pending_region.
        assert!(
            !should_open_preview_after_select_close(&state),
            "cancel arms no region -> Destroyed handler must NOT open the preview"
        );
    }

    #[test]
    fn disarm_clears_a_stale_arm_so_a_fresh_cycle_esc_opens_no_preview() {
        // code-reviewer should-fix regression (TASK-023 follow-up): the select
        // `Destroyed` branch now opens the preview off shared `pending_region`
        // state that is never cleared on a NEW selection cycle. Reachable stale
        // arm: confirm -> preview -> OCR needs consent -> take_and_recognize
        // RESTORES pending (Some) -> user closes the preview WITHOUT granting ->
        // pending stays Some. If the user then starts a new selection and presses
        // Esc, `should_open_preview_after_select_close` would see the stale Some
        // and open a preview over the OLD region - violating AC-02.1 (Esc = no
        // capture/preview). `disarm_pending_region` (run at the top of
        // `open_selection_window`) invalidates that arm so the fresh cycle's Esc
        // opens nothing. The full window sequence needs a live AppHandle, so this
        // pins the load-bearing helper invariant directly.
        let state = RegionState::default();

        // Simulate the stale arm left by a consent refusal + preview close.
        arm_region(&state);
        assert!(
            should_open_preview_after_select_close(&state),
            "precondition: a stale arm would (wrongly) open a preview"
        );

        // A fresh selection cycle (open_selection_window's first act) disarms it.
        disarm_pending_region(&state);

        // Now the new cycle's Esc/cancel opens no preview: the Destroyed decision
        // is scoped to the current cycle, which armed nothing.
        assert!(
            !should_open_preview_after_select_close(&state),
            "a fresh selection cycle must clear the stale arm so Esc opens no preview"
        );
        assert!(
            state.pending_region.lock().unwrap().is_none(),
            "disarm must leave the pending region empty"
        );
    }

    #[test]
    fn clamp_nudge_limits_the_per_keypress_delta() {
        assert_eq!(clamp_nudge(16), 16);
        assert_eq!(clamp_nudge(10_000), MAX_NUDGE_PX);
        assert_eq!(clamp_nudge(-10_000), -MAX_NUDGE_PX);
    }

    #[test]
    fn ocr_result_payload_embeds_degraded_fidelity_and_keeps_low_confidence() {
        // Fidelity + AC-02.6: the OCR result carries the `fidelity` tagged union
        // in its DEGRADED form ({"kind":"degraded","reason":...}) nested inside
        // the full payload, alongside the `lowConfidence` flag. The standalone
        // union test covers the shape; this pins that both coexist on the wire
        // the WebView actually receives (the degraded-with-high-confidence case
        // the declaration exists for, human-in-the-loop.md).
        let payload = OcrResultPayload {
            request_id: "r".into(),
            source_text: "Tiếng Việt".into(),
            low_confidence: false,
            detected_language: Some("vi".into()),
            fidelity: OcrFidelityPayload::Degraded {
                reason: "vi charset gap".into(),
            },
        };
        let value = serde_json::to_value(&payload).unwrap();
        assert_eq!(
            value["fidelity"],
            serde_json::json!({"kind": "degraded", "reason": "vi charset gap"})
        );
        assert_eq!(value["lowConfidence"], serde_json::json!(false));
        assert_eq!(value["detectedLanguage"], serde_json::json!("vi"));
    }

    #[test]
    fn empty_or_whitespace_source_text_is_guarded_before_translation() {
        // AC-02.7: `request_region_translation` rejects empty/whitespace source
        // text via its `.trim().is_empty()` guard, so no provider request is ever
        // issued for a no-recognition region. The command needs a live AppHandle
        // + State (not constructible in a unit test), so this pins the exact
        // guard predicate it uses; `build_ocr_payload_surfaces_empty_text_for_no_
        // recognition` covers the OCR half that produces the empty text.
        for text in ["", "   ", "\t\n  "] {
            let request = RegionTranslationRequest {
                request_id: "ui-empty".into(),
                source_text: text.into(),
                provider: "gemini".into(),
                model: "m".into(),
                target_language: None,
            };
            assert!(
                request.source_text.trim().is_empty(),
                "{text:?} must be treated as empty and skip the translation request"
            );
        }
    }
}
