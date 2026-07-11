//! Local whisper.cpp speech-to-text backend via `whisper-rs` (ADR-002).
//!
//! The default, always-present [`SpeechToText`] implementation. The whisper
//! context (the heavy model) is loaded LAZILY on the first `transcribe` and
//! never at app start, so the idle footprint stays inside NFR-PERF-03 until an
//! audio session is actually running (NFR-REL-02); [`WhisperStt::unload`]
//! releases it on session end.
//!
//! Fail-closed download (security-privacy.md): the first (download-triggering)
//! model load is refused until first-run consent is granted over IPC via the
//! SHARED consent gate (`crate::models::ModelGate`) - mirroring `ocr::paddle`.
//!
//! Privacy (AC-01.6 / BR-01): input audio stays in RAM (resampled in-memory to
//! whisper's 16 kHz); only the transcribed TEXT leaves this module, and STT is
//! local so audio never reaches the network.

use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use whisper_rs::{
    get_lang_str, FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters,
};

use super::engine::{
    mean_token_confidence, DetectedLanguage, SpeechToText, SttError, TranscribeOptions, Transcript,
    TranscriptSegment,
};
use super::model::{WhisperModel, WHISPER_MODEL_SET_ID};
use crate::audio::AudioChunk;
use crate::models::{ModelError, ModelGate};

/// whisper.cpp's required input sample rate. All chunks are resampled to this
/// mono rate before inference.
pub const WHISPER_SAMPLE_RATE: u32 = 16_000;

/// The local whisper backend. Cheap to construct; the whisper context is built
/// on first `transcribe` (lazy, NFR-REL-02).
pub struct WhisperStt {
    /// The selected model (size + on-disk filename), from the hardware probe.
    model: WhisperModel,
    /// Directory the `ggml-*.bin` model lives in (never the repo tree).
    model_dir: PathBuf,
    /// Fail-closed consent gate, consulted BEFORE every (download-triggering)
    /// model load. REQUIRED at construction (no optional/None path): a production
    /// engine can never reach a model load without having passed the fail-closed
    /// consent check, so no silent native-binary download can occur
    /// (security-privacy.md; TASK-014 review hardening).
    gate: Arc<ModelGate>,
    /// Inference thread count.
    n_threads: i32,
    /// Lazily-built whisper context. `None` until the first `transcribe`. The
    /// `Mutex` keeps the type `Sync` and single-flights the one-time load;
    /// transcription is serialized here, sufficient for one active session.
    ctx: Mutex<Option<WhisperContext>>,
}

impl WhisperStt {
    /// Creates an engine for `model` located under `model_dir` without loading
    /// anything (no whisper context, no download until the first `transcribe`).
    ///
    /// The fail-closed consent `gate` is REQUIRED: every model load passes
    /// through it, so there is no construction path that could reach a
    /// download/load without consent (security-privacy.md fail-closed download).
    #[must_use]
    pub fn new(model: WhisperModel, model_dir: PathBuf, gate: Arc<ModelGate>) -> Self {
        Self {
            model,
            model_dir,
            gate,
            n_threads: default_threads(),
            ctx: Mutex::new(None),
        }
    }

    /// Overrides the inference thread count (benchmarks/tuning).
    #[must_use]
    pub fn with_threads(mut self, n_threads: i32) -> Self {
        self.n_threads = n_threads.max(1);
        self
    }

    /// The consent model-set id this engine's downloads are gated under.
    #[must_use]
    pub fn model_set_id(&self) -> &'static str {
        WHISPER_MODEL_SET_ID
    }

    /// The on-disk path of the selected model.
    #[must_use]
    pub fn model_path(&self) -> PathBuf {
        self.model.path_in(&self.model_dir)
    }

    /// FAIL-CLOSED consent check + lazy whisper-context load. Returns the built
    /// context guard. The gate is checked FIRST because loading a missing model
    /// triggers a download (security-privacy.md); an already-present model still
    /// requires consent to have been granted for its download.
    fn ensure_loaded<'a>(&'a self, guard: &'a mut Option<WhisperContext>) -> Result<(), SttError> {
        if guard.is_some() {
            return Ok(());
        }

        // FAIL-CLOSED: the gate is a required field, so this check can never be
        // skipped. An already-present model still requires that consent was
        // granted for its download (security-privacy.md).
        self.gate
            .ensure_download_allowed(WHISPER_MODEL_SET_ID)
            .map_err(map_consent_error)?;

        let path = self.model_path();
        if !path.exists() {
            // The download step (TASK-015) fetches + SHA-256-verifies the model
            // after consent; until then a missing file is a load error, not a
            // silent fetch. Never leak absolute user paths into the message.
            return Err(SttError::ModelLoad(format!(
                "whisper model {} is not present; download required after consent",
                self.model.filename
            )));
        }

        let mut params = WhisperContextParameters::default();
        // CPU-only MVP build (ADR-002): never touch a GPU here.
        params.use_gpu(false);
        let path_str = path.to_string_lossy();
        let ctx = WhisperContext::new_with_params(&path_str, params)
            .map_err(|e| SttError::ModelLoad(e.to_string()))?;
        *guard = Some(ctx);
        Ok(())
    }

    /// Builds whisper `FullParams` for a chunk: quiet, single-pass, and either
    /// auto-detect (AC-01.3) or pinned (AC-01.4) source language.
    fn full_params<'a>(&self, options: &'a TranscribeOptions) -> FullParams<'a, 'a> {
        let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
        params.set_n_threads(self.n_threads);
        // Transcribe (never translate) - LLM translation is a separate stage.
        params.set_translate(false);
        // Keep whisper silent; captions come from the returned segments only.
        params.set_print_special(false);
        params.set_print_progress(false);
        params.set_print_realtime(false);
        params.set_print_timestamps(false);
        // Language: pinned code (AC-01.4) or "auto" to auto-detect (AC-01.3).
        match &options.language {
            Some(code) => params.set_language(Some(code.as_str())),
            None => params.set_language(Some("auto")),
        }
        params
    }
}

impl SpeechToText for WhisperStt {
    fn id(&self) -> &'static str {
        "whisper-cpp"
    }

    fn transcribe(
        &self,
        chunk: &AudioChunk,
        options: &TranscribeOptions,
    ) -> Result<Transcript, SttError> {
        if chunk.samples.is_empty() {
            return Err(SttError::InvalidInput("empty audio chunk".to_string()));
        }
        if chunk.sample_rate == 0 {
            return Err(SttError::InvalidInput("zero sample rate".to_string()));
        }

        // Resample to whisper's 16 kHz - purely in-memory (AC-01.6).
        let audio = resample_to_16k(&chunk.samples, chunk.sample_rate);

        let mut guard = self
            .ctx
            .lock()
            .map_err(|_| SttError::Inference("whisper context lock poisoned".to_string()))?;
        self.ensure_loaded(&mut guard)?;
        let ctx = guard
            .as_ref()
            .ok_or_else(|| SttError::Inference("whisper context unavailable".to_string()))?;

        let mut state = ctx
            .create_state()
            .map_err(|e| SttError::Inference(e.to_string()))?;
        state
            .full(self.full_params(options), &audio)
            .map_err(|e| SttError::Inference(e.to_string()))?;

        let n_segments = state
            .full_n_segments()
            .map_err(|e| SttError::Inference(e.to_string()))?;

        let mut segments = Vec::with_capacity(n_segments.max(0) as usize);
        for i in 0..n_segments {
            let text = state
                .full_get_segment_text_lossy(i)
                .map_err(|e| SttError::Inference(e.to_string()))?;
            let t0_ms = state.full_get_segment_t0(i).unwrap_or(0) * 10; // 10ms units
            let t1_ms = state.full_get_segment_t1(i).unwrap_or(0) * 10;

            // Per-segment confidence: mean of the sampled token probabilities
            // (AC-01.7). Special/timestamp tokens are included; a slight skew is
            // acceptable for a flag threshold.
            let n_tokens = state.full_n_tokens(i).unwrap_or(0);
            let mut probs = Vec::with_capacity(n_tokens.max(0) as usize);
            for t in 0..n_tokens {
                if let Ok(p) = state.full_get_token_prob(i, t) {
                    probs.push(p);
                }
            }
            segments.push(TranscriptSegment {
                text,
                confidence: mean_token_confidence(&probs),
                t0_ms,
                t1_ms,
            });
        }

        let language = match &options.language {
            // Pinned in Settings (AC-01.4): echo it, no auto-detect.
            Some(code) => DetectedLanguage {
                code: code.clone(),
                auto_detected: false,
            },
            // Auto-detected (AC-01.3): resolve whisper's detected language id.
            None => {
                let code = state
                    .full_lang_id_from_state()
                    .ok()
                    .and_then(get_lang_str)
                    .unwrap_or("auto")
                    .to_string();
                DetectedLanguage {
                    code,
                    auto_detected: true,
                }
            }
        };

        Ok(Transcript { segments, language })
    }

    fn is_loaded(&self) -> bool {
        self.ctx.lock().map(|g| g.is_some()).unwrap_or(false)
    }

    fn unload(&self) {
        if let Ok(mut guard) = self.ctx.lock() {
            *guard = None;
        }
    }
}

/// Maps a consent-gate error into the STT error surface. A missing consent
/// becomes [`SttError::ConsentRequired`] carrying the disclosure (the pipeline
/// forwards it to the UI); other gate errors become model-load failures.
fn map_consent_error(err: ModelError) -> SttError {
    match err {
        ModelError::ConsentRequired(disclosure) => SttError::ConsentRequired(disclosure),
        other => SttError::ModelLoad(other.to_string()),
    }
}

/// A sensible default whisper thread count: the machine's parallelism capped at
/// 8 (whisper.cpp sees diminishing returns beyond that and we leave headroom for
/// capture + the UI).
fn default_threads() -> i32 {
    std::thread::available_parallelism()
        .map(|n| (n.get() as i32).clamp(1, 8))
        .unwrap_or(4)
}

/// Taps of the anti-alias low-pass FIR applied before decimation. Odd (a
/// centered kernel with no fractional-sample group delay), and cheap: a 63-tap
/// direct convolution over a worst-case 2 s/48 kHz chunk is on the order of
/// 6M multiply-adds - sub-millisecond, far under the STT budget it protects.
const ANTI_ALIAS_TAPS: usize = 63;

/// Resamples mono `samples` from `src_rate` to whisper's 16 kHz. Pure and
/// in-memory (AC-01.6) so it is unit-tested without a model. A rate already at
/// 16 kHz is returned unchanged; an empty input yields an empty output.
///
/// DOWNsampling (the common WASAPI case, e.g. 48 kHz -> 16 kHz) first passes
/// the signal through a windowed-sinc low-pass filter cut at the destination
/// Nyquist frequency, THEN decimates by linear interpolation. Skipping the
/// filter (as a naive decimate-only resampler does) folds any source energy
/// above the new Nyquist back into the audible band as aliasing distortion -
/// a real, measurable transcription-quality regression on live system audio,
/// which routinely carries content above 8 kHz (sibilants, cymbals, etc.).
/// UPsampling has no aliasing risk, so it stays plain linear interpolation.
#[must_use]
pub fn resample_to_16k(samples: &[f32], src_rate: u32) -> Vec<f32> {
    if samples.is_empty() || src_rate == 0 {
        return Vec::new();
    }
    if src_rate == WHISPER_SAMPLE_RATE {
        return samples.to_vec();
    }

    let source = if src_rate > WHISPER_SAMPLE_RATE {
        // Cutoff at 90% of the destination Nyquist: a safety margin so the
        // filter's transition band (not a brick wall) still leaves the
        // aliased tail below the target Nyquist, not just at it.
        let cutoff_norm = 0.9 * (WHISPER_SAMPLE_RATE as f64 / (2.0 * src_rate as f64));
        let kernel = lowpass_kernel(ANTI_ALIAS_TAPS, cutoff_norm);
        apply_fir(samples, &kernel)
    } else {
        samples.to_vec()
    };

    let src_len = source.len();
    let dst_len = ((src_len as u64 * WHISPER_SAMPLE_RATE as u64) / src_rate as u64) as usize;
    if dst_len == 0 {
        return Vec::new();
    }
    let ratio = (src_rate as f64) / (WHISPER_SAMPLE_RATE as f64);
    let mut out = Vec::with_capacity(dst_len);
    for i in 0..dst_len {
        let src_pos = i as f64 * ratio;
        let idx = src_pos.floor() as usize;
        let frac = (src_pos - idx as f64) as f32;
        let a = source[idx];
        let b = if idx + 1 < src_len {
            source[idx + 1]
        } else {
            a
        };
        out.push(a + (b - a) * frac);
    }
    out
}

/// Designs a windowed-sinc low-pass FIR kernel: `num_taps` coefficients, unity
/// DC gain, cutoff at `cutoff_norm` (a fraction of the SOURCE sample rate,
/// `0 < cutoff_norm < 0.5`). Hamming-windowed for a good stopband/transition
/// trade-off at a small, real-time-cheap tap count. Pure and deterministic.
fn lowpass_kernel(num_taps: usize, cutoff_norm: f64) -> Vec<f32> {
    let m = (num_taps.max(1) - 1) as f64;
    let mut kernel = vec![0f64; num_taps.max(1)];
    let mut sum = 0f64;
    for (n, tap) in kernel.iter_mut().enumerate() {
        let x = n as f64 - m / 2.0;
        let sinc = if x.abs() < 1e-9 {
            2.0 * cutoff_norm
        } else {
            (2.0 * std::f64::consts::PI * cutoff_norm * x).sin() / (std::f64::consts::PI * x)
        };
        // Hamming window.
        let window = if m > 0.0 {
            0.54 - 0.46 * (2.0 * std::f64::consts::PI * n as f64 / m).cos()
        } else {
            1.0
        };
        let v = sinc * window;
        *tap = v;
        sum += v;
    }
    // Normalize so the passband (DC) gain is exactly 1 - the filter must not
    // change the overall loudness of in-band speech.
    if sum.abs() > 1e-12 {
        for tap in kernel.iter_mut() {
            *tap /= sum;
        }
    }
    kernel.into_iter().map(|v| v as f32).collect()
}

/// Direct-form FIR convolution, zero-padded at the edges, output the same
/// length as `input` (centered kernel, so no net delay is introduced beyond
/// the negligible half-kernel edge taper already covered by the chunker's
/// pre-roll/hangover margins).
fn apply_fir(input: &[f32], kernel: &[f32]) -> Vec<f32> {
    let n = input.len();
    let k = kernel.len();
    if k <= 1 {
        return input.to_vec();
    }
    let half = (k / 2) as isize;
    let mut out = vec![0f32; n];
    for (i, sample) in out.iter_mut().enumerate() {
        let mut acc = 0f64;
        for (j, &coeff) in kernel.iter().enumerate() {
            let idx = i as isize + j as isize - half;
            if idx >= 0 && (idx as usize) < n {
                acc += input[idx as usize] as f64 * coeff as f64;
            }
        }
        *sample = acc as f32;
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{InMemoryConsentStore, ModelGate};
    use crate::stt::model::{whisper_model_set_descriptor, WhisperModel};

    fn chunk(samples: Vec<f32>, rate: u32) -> AudioChunk {
        AudioChunk {
            samples,
            sample_rate: rate,
            sequence: 0,
        }
    }

    /// Builds a real [`ModelGate`] over an in-memory store registering the
    /// whisper descriptor. `granted` controls whether consent is pre-recorded,
    /// so tests exercise both the fail-closed and post-consent paths with no
    /// network and no model file.
    fn test_gate(granted: bool) -> Arc<ModelGate> {
        let gate = Arc::new(ModelGate::new(
            Arc::new(InMemoryConsentStore::default()),
            vec![whisper_model_set_descriptor(
                WhisperModel::TINY,
                PathBuf::from("/cache"),
            )],
        ));
        if granted {
            gate.grant(WHISPER_MODEL_SET_ID).unwrap();
        }
        gate
    }

    /// A cheap engine with a granted gate for the guards that never reach a load
    /// (empty/zero-rate input, lazy-load and unload probes).
    fn engine(model: WhisperModel, dir: &str) -> WhisperStt {
        WhisperStt::new(model, PathBuf::from(dir), test_gate(true))
    }

    #[test]
    fn resample_passthrough_at_16k() {
        let s = vec![0.1, -0.2, 0.3, 0.4];
        assert_eq!(resample_to_16k(&s, 16_000), s);
    }

    #[test]
    fn resample_48k_to_16k_decimates_by_three() {
        // 48 kHz -> 16 kHz: length shrinks ~3x.
        let s = vec![0.0f32; 4_800];
        let out = resample_to_16k(&s, 48_000);
        assert_eq!(out.len(), 1_600);
    }

    #[test]
    fn resample_empty_or_zero_rate_is_empty() {
        assert!(resample_to_16k(&[], 48_000).is_empty());
        assert!(resample_to_16k(&[0.1, 0.2], 0).is_empty());
    }

    #[test]
    fn resample_interpolates_linearly() {
        // Upsample a ramp 8k -> 16k: midpoints appear between originals.
        let s = vec![0.0, 1.0];
        let out = resample_to_16k(&s, 8_000);
        assert_eq!(out.len(), 4);
        assert!((out[0] - 0.0).abs() < 1e-6);
        // Interpolated points lie within the ramp.
        assert!(out.iter().all(|&v| (0.0..=1.0).contains(&v)));
    }

    /// Synthetic tone at `hz` sampled at `rate`, `seconds` long, amplitude 0.2.
    fn tone_signal(hz: f64, rate: u32, seconds: f64) -> Vec<f32> {
        let n = (rate as f64 * seconds) as usize;
        (0..n)
            .map(|i| ((i as f64 * hz * std::f64::consts::TAU / rate as f64).sin() * 0.2) as f32)
            .collect()
    }

    #[test]
    fn resample_passes_in_band_tone_at_near_full_amplitude() {
        // A 300 Hz tone (well under whisper's 8 kHz Nyquist) at 48 kHz -> 16 kHz
        // must survive the anti-aliasing low-pass with amplitude close to intact
        // (quality regression guard: the filter must not gut real speech energy).
        let s = tone_signal(300.0, 48_000, 0.2);
        let out = resample_to_16k(&s, 48_000);
        let rms =
            (out.iter().map(|&v| (v as f64) * (v as f64)).sum::<f64>() / out.len() as f64).sqrt();
        // Input RMS of a 0.2-amplitude sine is 0.2/sqrt(2) ~= 0.1414.
        assert!(
            rms > 0.12,
            "in-band tone lost too much energy through the resample: rms={rms}"
        );
    }

    #[test]
    fn resample_rejects_above_nyquist_energy_instead_of_aliasing_it_down() {
        // AC-01.2/BR-01 quality guard: naive decimation (no anti-alias filter)
        // folds a source-Nyquist-adjacent tone straight into the audible band -
        // this is the aliasing bug that degrades live-audio transcription
        // quality. An 18 kHz tone at 48 kHz is far above whisper's 8 kHz target
        // Nyquist; a correct downsampler attenuates it heavily instead of
        // aliasing it down to an in-band ~2 kHz artifact at near-full amplitude.
        let s = tone_signal(18_000.0, 48_000, 0.2);
        let out = resample_to_16k(&s, 48_000);
        let rms =
            (out.iter().map(|&v| (v as f64) * (v as f64)).sum::<f64>() / out.len() as f64).sqrt();
        assert!(
            rms < 0.05,
            "above-Nyquist energy aliased into the output near full amplitude: rms={rms}"
        );
    }

    #[test]
    fn empty_chunk_is_rejected_without_loading() {
        let engine = engine(WhisperModel::TINY, "/nonexistent");
        assert!(matches!(
            engine.transcribe(&chunk(vec![], 48_000), &TranscribeOptions::auto()),
            Err(SttError::InvalidInput(_))
        ));
        assert!(!engine.is_loaded());
    }

    #[test]
    fn zero_rate_chunk_is_rejected_without_loading() {
        let engine = engine(WhisperModel::TINY, "/nonexistent");
        assert!(matches!(
            engine.transcribe(&chunk(vec![0.1; 10], 0), &TranscribeOptions::auto()),
            Err(SttError::InvalidInput(_))
        ));
        assert!(!engine.is_loaded());
    }

    #[test]
    fn new_engine_does_not_load_the_whisper_context() {
        // Lazy load (NFR-REL-02): construction must not build the context.
        let engine = engine(WhisperModel::BASE, "/models");
        assert!(!engine.is_loaded());
    }

    #[test]
    fn unload_is_idempotent_on_an_unloaded_engine() {
        let engine = engine(WhisperModel::BASE, "/models");
        engine.unload();
        assert!(!engine.is_loaded());
    }

    #[test]
    fn transcribe_fails_closed_without_consent_and_never_loads() {
        // FAIL-CLOSED (security-privacy.md): an engine carrying a consent gate
        // with NO consent recorded refuses transcription with ConsentRequired and
        // never reaches the download-triggering model load - so this test makes
        // no network call and needs no model file. Mirrors ocr::paddle's guard.
        let engine = WhisperStt::new(
            WhisperModel::TINY,
            PathBuf::from("/models"),
            test_gate(false),
        );

        // Non-empty chunk so the input guard does not short-circuit first.
        let result =
            engine.transcribe(&chunk(vec![0.0; 1_600], 16_000), &TranscribeOptions::auto());
        match result {
            Err(SttError::ConsentRequired(disclosure)) => {
                assert_eq!(disclosure.model_set_id, WHISPER_MODEL_SET_ID);
                assert_eq!(disclosure.host_domain, "huggingface.co");
                assert!(disclosure.total_approx_size_bytes > 0);
            }
            other => panic!("expected ConsentRequired without a load, got {other:?}"),
        }
        // The download/load path was never reached.
        assert!(!engine.is_loaded());
    }

    #[test]
    fn missing_model_after_consent_is_a_load_error_not_a_silent_fetch() {
        // Consent granted but the model file is absent: a load error, NOT a
        // silent download (the fetch is the TASK-015 step). No network here.
        let engine = WhisperStt::new(
            WhisperModel::TINY,
            PathBuf::from("/definitely/not/here"),
            test_gate(true),
        );

        assert!(matches!(
            engine.transcribe(&chunk(vec![0.0; 1_600], 16_000), &TranscribeOptions::auto()),
            Err(SttError::ModelLoad(_))
        ));
        assert!(!engine.is_loaded());
    }

    /// End-to-end whisper inference against a REAL, already-present ggml model
    /// (no download - the model path comes from `OST_WHISPER_TEST_MODEL`), on
    /// SYNTHETIC audio only. Gated behind `stt-live` so it never runs in default
    /// CI (testing.md). Proves the gate-less engine loads the context, runs
    /// `full`, and `unload` releases it (resource discipline, NFR-REL-02).
    /// A granted consent gate is required by the constructor (the model already
    /// exists on disk, so consent stands in for the download that produced it).
    #[cfg(feature = "stt-live")]
    #[test]
    fn live_whisper_transcribes_synthetic_audio_then_unloads() {
        let Some(model_file) = std::env::var_os("OST_WHISPER_TEST_MODEL") else {
            eprintln!("skipping: set OST_WHISPER_TEST_MODEL to a real ggml-*.bin");
            return;
        };
        let path = PathBuf::from(model_file);
        let dir = path.parent().unwrap().to_path_buf();
        let filename: &'static str = Box::leak(
            path.file_name()
                .unwrap()
                .to_string_lossy()
                .into_owned()
                .into_boxed_str(),
        );
        let model = WhisperModel {
            filename,
            ..WhisperModel::TINY
        };
        // The model is already on disk; a granted gate satisfies the required
        // fail-closed consent check for the download that produced it.
        let engine = WhisperStt::new(model, dir, test_gate(true));
        assert!(!engine.is_loaded(), "must not load at construction");

        // One second of a 440 Hz tone at 16 kHz (synthetic - no user audio).
        let samples: Vec<f32> = (0..16_000)
            .map(|n| (n as f32 * 440.0 * std::f32::consts::TAU / 16_000.0).sin() * 0.2)
            .collect();
        let transcript = engine
            .transcribe(&chunk(samples, 16_000), &TranscribeOptions::auto())
            .expect("live transcription should succeed");
        assert!(
            engine.is_loaded(),
            "context must be loaded after transcribe"
        );
        // A detected language code is always surfaced (AC-01.3).
        assert!(!transcript.language.code.is_empty());

        engine.unload();
        assert!(!engine.is_loaded(), "context must be released after unload");
    }
}
