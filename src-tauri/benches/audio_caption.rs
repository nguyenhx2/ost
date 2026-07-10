//! Criterion latency benchmark for the audio caption end-to-end path
//! (AC-01.2 / AC-05.5; NFR audio caption end-to-end p95 < 3s).
//!
//! Guards the hot path of the live audio pipeline: one speech chunk ->
//! whisper.cpp transcribe (the CPU-bound cost) -> provider translate. The
//! translate step is provider I/O, so it is MOCKED with an instant stub here
//! (testing.md: no real provider calls in benches); the measured cost is
//! therefore the STT chunk path plus the (negligible) mock translate, which is
//! what the p95 budget is dominated by on a local, latency-only run.
//!
//! This bench requires a REAL whisper model. It fetches one ONCE through the
//! pinned + SHA-256-verified, consent-gated download path (`stt::download`) into
//! the gitignored model cache dir, so the benchmark also exercises the hardened
//! download end to end. Behind the `stt-live` feature so it NEVER runs in default
//! CI and no model is downloaded there (testing.md).
//!
//! Run (dev host, with the native toolchain on PATH):
//!   cargo bench --features stt-live --bench audio_caption
//! Model size via `OST_WHISPER_BENCH_SIZE` (tiny|base|small|medium; default base);
//! cache dir via `OST_WHISPER_MODEL_DIR` (default the repo `models/`, gitignored).

use std::path::PathBuf;
use std::sync::Arc;
use std::time::{Duration, Instant};

use criterion::{criterion_group, criterion_main, Criterion};

use ost_lib::audio::AudioChunk;
use ost_lib::models::{InMemoryConsentStore, ModelGate};
use ost_lib::stt::{
    ensure_model_available, whisper_model_set_descriptor, SpeechToText, TranscribeOptions,
    WhisperModel, WhisperModelSize, WhisperStt,
};

/// One second of a 220 Hz synthetic tone at 16 kHz (never real user audio). The
/// chunker force-splits utterances at ~2 s, so a 2 s chunk is the worst-case
/// caption unit; whisper pads to its 30 s encoder window regardless, so this is
/// representative of the real per-chunk transcribe cost.
fn synthetic_chunk(seconds: u32) -> AudioChunk {
    let n = 16_000 * seconds as usize;
    let samples: Vec<f32> = (0..n)
        .map(|i| (i as f32 * 220.0 * std::f32::consts::TAU / 16_000.0).sin() * 0.2)
        .collect();
    AudioChunk {
        samples,
        sample_rate: 16_000,
        sequence: 0,
    }
}

fn bench_size() -> WhisperModelSize {
    match std::env::var("OST_WHISPER_BENCH_SIZE")
        .unwrap_or_else(|_| "base".into())
        .to_lowercase()
        .as_str()
    {
        "tiny" => WhisperModelSize::Tiny,
        "small" => WhisperModelSize::Small,
        "medium" => WhisperModelSize::Medium,
        _ => WhisperModelSize::Base,
    }
}

fn model_dir() -> PathBuf {
    std::env::var_os("OST_WHISPER_MODEL_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("models"))
}

/// Ensures the benchmark model is present via the pinned + verified, consent-
/// gated download path, and returns a warmed engine ready to transcribe.
fn setup_engine() -> WhisperStt {
    let model = WhisperModel::for_size(bench_size());
    let dir = model_dir();

    // A granted in-memory gate stands in for the user's first-run consent so the
    // pinned + SHA-256-verified download proceeds (the real gate is fail-closed).
    let gate = Arc::new(ModelGate::new(
        Arc::new(InMemoryConsentStore::default()),
        vec![whisper_model_set_descriptor(model, dir.clone())],
    ));
    gate.grant("whisper-ggml").expect("grant consent");

    let rt = tokio::runtime::Runtime::new().expect("tokio runtime");
    rt.block_on(async {
        ensure_model_available(model, &dir, &gate)
            .await
            .expect("download + SHA-256 verify the whisper model")
    });

    let engine = WhisperStt::new(model, dir, gate);
    // Warm the lazy context so the one-time model load is excluded from timing.
    let warm = synthetic_chunk(1);
    engine
        .transcribe(&warm, &TranscribeOptions::auto())
        .expect("warm transcribe");
    engine
}

/// Instant stub translator (provider I/O mocked). Kept trivial so the measured
/// caption cost is the STT chunk path, not a network round-trip.
fn mock_translate(source_text: &str) -> String {
    format!("[vi]{source_text}")
}

fn bench_audio_caption(c: &mut Criterion) {
    let engine = setup_engine();
    let chunk = synthetic_chunk(2);
    let options = TranscribeOptions::auto();

    // --- Manual p95 harness: the headline the latency budget is stated in. ---
    // Criterion reports mean/median; we additionally measure the p95 directly
    // over a fixed sample and print + assert it against the < 3s budget.
    let iters = 30;
    let mut samples: Vec<Duration> = Vec::with_capacity(iters);
    for _ in 0..iters {
        let start = Instant::now();
        let transcript = engine.transcribe(&chunk, &options).expect("transcribe");
        let _ = mock_translate(&transcript.text(" "));
        samples.push(start.elapsed());
    }
    samples.sort();
    let p95 = samples[((iters as f64 * 0.95).ceil() as usize).min(iters) - 1];
    let median = samples[iters / 2];
    eprintln!(
        "[audio-caption] model={:?} n={} median={:?} p95={:?} budget=3s -> {}",
        bench_size(),
        iters,
        median,
        p95,
        if p95 < Duration::from_secs(3) {
            "WITHIN BUDGET"
        } else {
            "OVER BUDGET"
        }
    );
    assert!(
        p95 < Duration::from_secs(3),
        "audio caption p95 {p95:?} exceeds the 3s budget (AC-01.2/AC-05.5)"
    );

    // --- Criterion regression guard on the same path. ---
    let mut group = c.benchmark_group("audio_caption");
    group.sample_size(10);
    group.measurement_time(Duration::from_secs(30));
    group.bench_function("transcribe_2s_chunk", |b| {
        b.iter(|| {
            let transcript = engine.transcribe(&chunk, &options).expect("transcribe");
            let translated = mock_translate(&transcript.text(" "));
            std::hint::black_box(translated);
        });
    });
    group.finish();
}

criterion_group!(benches, bench_audio_caption);
criterion_main!(benches);
