//! R1 OCR latency + accuracy spike harness (ADR-004, TASK-007 step one).
//!
//! This is the measurement deliverable. It is gated behind `OST_OCR_SPIKE=1`
//! (and the `ocr-spike` feature) so it never runs in default `cargo test`: it
//! downloads PP-OCRv5 models from ModelScope on first run and needs system
//! fonts. It prints, to stdout (`--nocapture`):
//!   - OCR-stage latency distribution (min/median/p95/max) across crop sizes,
//!   - per-language character accuracy vs the stated bars,
//!   - per-line confidence distribution (feeds OI-07),
//!   - resident RAM active vs post-session (NFR-PERF-03) and lazy-load proof.
//!
//! Run:
//!   OST_OCR_SPIKE=1 cargo test --features ocr-spike --test ocr_spike -- --nocapture
//!
//! Fixtures are synthetic (rendered from invented strings) - no user content.

#![cfg(feature = "ocr-spike")]

use std::time::Instant;

use ost_lib::ocr::fixtures::{build_fixture_set, latency_fixture, Lang};
use ost_lib::ocr::{character_accuracy, OcrConfidence, OcrEngine, PaddleOcrEngine};

/// Stated minimum character-accuracy bars for the spike gate.
const BAR_EN_GENERAL: f32 = 0.90;
const BAR_JA_GENERAL: f32 = 0.80;
const BAR_EN_SUBTITLE: f32 = 0.90;
const BAR_JA_SUBTITLE: f32 = 0.75;
const BAR_JA_VERTICAL: f32 = 0.70;
const BAR_VI_GENERAL: f32 = 0.85;

/// OCR-stage latency budget (ADR-004 R1).
const BUDGET_MS_P95: f64 = 700.0;

fn spike_enabled() -> bool {
    std::env::var("OST_OCR_SPIKE").as_deref() == Ok("1")
}

/// Collapse whitespace and trim (spacing-aware view, for Latin).
fn normalize(s: &str) -> String {
    s.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// Strip ALL whitespace: the fair character-recognition metric independent of
/// how the detector segments a line into boxes. Vertical CJK returns one box
/// per glyph, so space-insensitive CER is the correct OCR-quality measure.
fn strip_ws(s: &str) -> String {
    s.chars().filter(|c| !c.is_whitespace()).collect()
}

fn percentile(sorted: &[f64], p: f64) -> f64 {
    if sorted.is_empty() {
        return f64::NAN;
    }
    let rank = (p / 100.0) * ((sorted.len() - 1) as f64);
    let lo = rank.floor() as usize;
    let hi = rank.ceil() as usize;
    if lo == hi {
        sorted[lo]
    } else {
        let frac = rank - lo as f64;
        sorted[lo] * (1.0 - frac) + sorted[hi] * frac
    }
}

/// Resident working-set RAM (bytes) of the current process, via the Windows
/// `K32GetProcessMemoryInfo` export on kernel32 (no extra dependency).
#[cfg(windows)]
fn working_set_bytes() -> u64 {
    #[repr(C)]
    struct ProcessMemoryCounters {
        cb: u32,
        page_fault_count: u32,
        peak_working_set_size: usize,
        working_set_size: usize,
        quota_peak_paged_pool_usage: usize,
        quota_paged_pool_usage: usize,
        quota_peak_non_paged_pool_usage: usize,
        quota_non_paged_pool_usage: usize,
        pagefile_usage: usize,
        peak_pagefile_usage: usize,
    }
    extern "system" {
        fn GetCurrentProcess() -> isize;
        fn K32GetProcessMemoryInfo(
            process: isize,
            counters: *mut ProcessMemoryCounters,
            cb: u32,
        ) -> i32;
    }
    let mut counters: ProcessMemoryCounters = unsafe { std::mem::zeroed() };
    counters.cb = std::mem::size_of::<ProcessMemoryCounters>() as u32;
    let ok = unsafe {
        K32GetProcessMemoryInfo(
            GetCurrentProcess(),
            &mut counters,
            std::mem::size_of::<ProcessMemoryCounters>() as u32,
        )
    };
    if ok == 0 {
        0
    } else {
        counters.working_set_size as u64
    }
}

fn mb(bytes: u64) -> f64 {
    bytes as f64 / (1024.0 * 1024.0)
}

#[test]
fn r1_ocr_spike() {
    if !spike_enabled() {
        eprintln!("ocr_spike: skipped (set OST_OCR_SPIKE=1 to run the R1 measurement)");
        return;
    }

    println!("\n================ R1 OCR SPIKE (ADR-004) ================");
    println!("machine OCR runs on this CPU; fixtures synthetic, models PP-OCRv5 mobile\n");

    // ---- RAM: lazy-load proof (engine constructed, session NOT built) ----
    let ram_start = working_set_bytes();
    let main_engine = PaddleOcrEngine::main();
    let ram_after_new = working_set_bytes();
    assert!(
        !main_engine.is_loaded(),
        "ONNX session must not build at construction (NFR-REL-02)"
    );
    println!("RAM at test start        : {:.1} MB", mb(ram_start));
    println!(
        "RAM after engine::new()  : {:.1} MB (session loaded = {})",
        mb(ram_after_new),
        main_engine.is_loaded()
    );

    // ---- Warm the main engine (builds the lazy ORT session) ----
    let warm_fx = latency_fixture(800, 200, 52.0).expect("latin font for warmup fixture");
    let cold_t = Instant::now();
    let _ = main_engine
        .recognize(&warm_fx.image)
        .expect("warmup recognize");
    let cold_ms = cold_t.elapsed().as_secs_f64() * 1000.0;
    assert!(main_engine.is_loaded(), "session should be built after use");
    let ram_active = working_set_bytes();
    println!("RAM active (session built): {:.1} MB", mb(ram_active));
    println!(
        "Cold first-call latency  : {:.1} ms (includes model download+session build)",
        cold_ms
    );

    // ---- Latency distribution across representative crop sizes ----
    let sizes = [
        (400u32, 100u32, 34.0f32),
        (800, 200, 52.0),
        (1200, 300, 72.0),
        (1200, 800, 88.0),
    ];
    let mut all_latencies: Vec<f64> = Vec::new();
    println!("\n---- Latency per crop size (warm, PP-OCRv5 main) ----");
    for (w, h, px) in sizes {
        let fx = match latency_fixture(w, h, px) {
            Some(f) => f,
            None => continue,
        };
        let _ = main_engine.recognize(&fx.image); // warm this size
        let mut samples: Vec<f64> = Vec::new();
        for _ in 0..25 {
            let t = Instant::now();
            let _ = main_engine.recognize(&fx.image).expect("recognize");
            samples.push(t.elapsed().as_secs_f64() * 1000.0);
        }
        samples.sort_by(|a, b| a.partial_cmp(b).unwrap());
        all_latencies.extend(samples.iter().copied());
        println!(
            "  {:>4}x{:<4}  n={:<3} min={:>6.1} med={:>6.1} p95={:>6.1} max={:>6.1} ms",
            w,
            h,
            samples.len(),
            samples[0],
            percentile(&samples, 50.0),
            percentile(&samples, 95.0),
            samples[samples.len() - 1]
        );
    }
    all_latencies.sort_by(|a, b| a.partial_cmp(b).unwrap());
    let p95 = percentile(&all_latencies, 95.0);
    println!(
        "\nAGGREGATE latency  n={} min={:.1} med={:.1} p95={:.1} max={:.1} ms  (budget p95 <= {} ms)",
        all_latencies.len(),
        all_latencies[0],
        percentile(&all_latencies, 50.0),
        p95,
        all_latencies[all_latencies.len() - 1],
        BUDGET_MS_P95
    );

    // ---- Accuracy per language/category + confidence collection ----
    let fixtures = build_fixture_set();
    let mut conf_scores: Vec<f32> = Vec::new();
    println!("\n---- Character accuracy per fixture ----");
    // Cache one engine per language to avoid rebuilding sessions repeatedly.
    let latin_engine = PaddleOcrEngine::latin();
    let korean_engine = PaddleOcrEngine::korean();

    let mut acc_by_key: Vec<(String, f32)> = Vec::new();
    for fx in &fixtures {
        let engine: &PaddleOcrEngine = match fx.lang {
            Lang::En | Lang::Ja | Lang::Zh => &main_engine,
            Lang::Vi => &latin_engine,
            Lang::Ko => &korean_engine,
        };
        let out = engine.recognize(&fx.image).expect("recognize fixture");
        let hyp = out.concatenated(" ");
        // Space-insensitive accuracy is the headline (fair OCR-quality metric);
        // spacing-aware is shown alongside for Latin context.
        let acc = character_accuracy(&strip_ws(&fx.text), &strip_ws(&hyp));
        let acc_spaced = character_accuracy(&normalize(&fx.text), &normalize(&hyp));
        if let OcrConfidence::PerLine(scores) = &out.confidence {
            conf_scores.extend(scores.iter().copied());
        }
        println!(
            "  {:<24} acc={:.3} (spaced {:.3})  ref={:?}  hyp={:?}",
            fx.name, acc, acc_spaced, fx.text, hyp
        );
        acc_by_key.push((fx.name.clone(), acc));
    }

    // ---- Confidence distribution (OI-07) ----
    println!(
        "\n---- Per-line confidence distribution (n={}) ----",
        conf_scores.len()
    );
    if !conf_scores.is_empty() {
        let mut cs: Vec<f64> = conf_scores.iter().map(|&s| s as f64).collect();
        cs.sort_by(|a, b| a.partial_cmp(b).unwrap());
        let mean = cs.iter().sum::<f64>() / cs.len() as f64;
        println!(
            "  min={:.3} p05={:.3} p25={:.3} median={:.3} mean={:.3} p95={:.3} max={:.3}",
            cs[0],
            percentile(&cs, 5.0),
            percentile(&cs, 25.0),
            percentile(&cs, 50.0),
            mean,
            percentile(&cs, 95.0),
            cs[cs.len() - 1]
        );
        let buckets = [0.0, 0.5, 0.7, 0.8, 0.9, 0.95, 1.0001];
        for w in buckets.windows(2) {
            let n = cs.iter().filter(|&&v| v >= w[0] && v < w[1]).count();
            println!("    [{:.2}, {:.2}) : {}", w[0], w[1], n);
        }
    }

    // ---- Idle RAM after a post-session window (NFR-PERF-03) ----
    // Peak while all three language sessions are resident + fixtures retained
    // (the worst case, not the idle case).
    let ram_all_resident = working_set_bytes();
    println!(
        "\nRAM with 3 sessions + fixtures resident (worst case): {:.1} MB",
        mb(ram_all_resident)
    );
    // Return to idle: drop every engine (releases ORT sessions) and the
    // fixtures. This is what the app must do when a region session ends to
    // hold the NFR-PERF-03 idle budget.
    drop(fixtures);
    drop(latin_engine);
    drop(korean_engine);
    drop(main_engine);
    let ram_after_drop = working_set_bytes();
    println!(
        "RAM immediately after dropping engines: {:.1} MB",
        mb(ram_after_drop)
    );

    let idle_secs: u64 = std::env::var("OST_OCR_IDLE_SECS")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(60);
    println!("---- Idle probe: sleeping {idle_secs}s post-session ----");
    std::thread::sleep(std::time::Duration::from_secs(idle_secs));
    let ram_idle = working_set_bytes();
    println!(
        "RAM {}s post-session (engines dropped): {:.1} MB (NFR-PERF-03 idle target < 100 MB)",
        idle_secs,
        mb(ram_idle)
    );

    // ---- Gate summary ----
    println!("\n================ SUMMARY ================");
    println!(
        "latency p95 = {:.1} ms  (budget <= {} ms)",
        p95, BUDGET_MS_P95
    );
    let bar =
        |name: &str| -> Option<f32> { acc_by_key.iter().find(|(k, _)| k == name).map(|(_, a)| *a) };
    let checks: Vec<(&str, Option<f32>, f32)> = vec![
        (
            "en-general-800x200",
            bar("en-general-800x200"),
            BAR_EN_GENERAL,
        ),
        (
            "ja-general-800x160",
            bar("ja-general-800x160"),
            BAR_JA_GENERAL,
        ),
        (
            "en-subtitle-lowdpi",
            bar("en-subtitle-lowdpi"),
            BAR_EN_SUBTITLE,
        ),
        (
            "ja-subtitle-lowdpi",
            bar("ja-subtitle-lowdpi"),
            BAR_JA_SUBTITLE,
        ),
        ("ja-vertical", bar("ja-vertical"), BAR_JA_VERTICAL),
        (
            "vi-general-900x160",
            bar("vi-general-900x160"),
            BAR_VI_GENERAL,
        ),
    ];
    for (name, got, bar_v) in &checks {
        match got {
            Some(a) => println!(
                "  {:<22} acc={:.3}  bar>={:.2}  {}",
                name,
                a,
                bar_v,
                if a >= bar_v { "PASS" } else { "FAIL" }
            ),
            None => println!("  {name:<22} (not measured - font/model absent)"),
        }
    }
    println!("========================================\n");
    // The harness never fails the build on a missed bar: the decision gate is an
    // owner/orchestrator call (ADR-004 R2). It reports; it does not decide.
}
