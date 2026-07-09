//! Criterion latency benchmark for the OCR stage (ADR-004 R1; NFR-PERF-05).
//!
//! Guards the OCR-stage working budget (<= 700ms p95). The engine is warmed
//! once (lazy ONNX Runtime session build excluded) so the benchmark measures
//! steady-state per-region recognition cost, which is what the region-translate
//! budget (NFR-PERF-02) depends on. Regressions beyond budget surface here.
//!
//! Run: `cargo bench --features ocr-spike`. Requires the PP-OCRv5 models (first
//! run downloads them from ModelScope) and a Latin system font for the fixture.

use std::time::Duration;

use criterion::{criterion_group, criterion_main, BenchmarkId, Criterion};
use ost_lib::ocr::fixtures::latency_fixture;
use ost_lib::ocr::{OcrEngine, PaddleOcrEngine};

fn bench_ocr_stage(c: &mut Criterion) {
    let engine = PaddleOcrEngine::main();

    // Representative crop sizes from ~400x100 up to ~1200x800 (ADR-004 R1).
    let sizes = [
        (400u32, 100u32, 34.0f32),
        (800, 200, 52.0),
        (1200, 300, 72.0),
        (1200, 800, 88.0),
    ];

    let mut group = c.benchmark_group("ocr_stage");
    group.sample_size(20);
    group.measurement_time(Duration::from_secs(20));

    for (w, h, px) in sizes {
        let fixture = match latency_fixture(w, h, px) {
            Some(f) => f,
            None => continue, // No Latin font on this machine; skip gracefully.
        };
        // Warm the lazy session so cold-start init is excluded from the timing.
        let _ = engine.recognize(&fixture.image);

        group.bench_with_input(
            BenchmarkId::from_parameter(format!("{w}x{h}")),
            &fixture.image,
            |b, img| {
                b.iter(|| {
                    let out = engine.recognize(img).expect("recognize");
                    std::hint::black_box(out);
                });
            },
        );
    }
    group.finish();
}

criterion_group!(benches, bench_ocr_stage);
criterion_main!(benches);
