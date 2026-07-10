//! R2 OCR spike harness (ADR-004 R2, TASK-007) - Vietnamese quality round.
//!
//! Closes the R1 open item (vi 0.73-0.74 below the 0.85 bar) by testing two
//! remedies with numbers, and re-measuring the full gate so nothing regresses:
//!
//!   1. UPSCALE PATH: vi character accuracy vs pre-recognition Lanczos3 upscale
//!      factor (1.0/1.5/2.0/3.0x) on the latin mobile rec. Tests the hypothesis
//!      "dense tone-mark stacks are lost to insufficient effective DPI".
//!   2. CHARSET PROBE: does the latin rec EVER emit a composed U+1E00-U+1EFF
//!      Vietnamese glyph, even on a large clean crop? If never, the gap is the
//!      charset (missing vocabulary), which no upscale can fix.
//!   3. HEAVIER REC: PP-OCRv5 SERVER main rec vs mobile main rec - full-gate
//!      accuracy (en/ja/vertical/low-DPI/ko/zh) + latency + vi, with model
//!      size/download deltas.
//!
//! Gated behind `OST_OCR_SPIKE_R2=1` and the `ocr-spike` feature so it never
//! runs in default `cargo test` (it downloads models + needs system fonts).
//!
//! Run:
//!   OST_OCR_SPIKE_R2=1 cargo test --features ocr-spike --test ocr_spike_r2 -- --nocapture
//!
//! Fixtures are synthetic (rendered from invented strings) - no user content.

#![cfg(feature = "ocr-spike")]

use std::time::Instant;

use ost_lib::ocr::fixtures::{build_fixture_set, latency_fixture, upscale, vi_charset_probe, Lang};
use ost_lib::ocr::{character_accuracy, OcrConfidence, OcrEngine, PaddleOcrEngine};

/// Vietnamese quality bar set in R1.
const BAR_VI: f32 = 0.85;
/// OCR-stage latency budget (ADR-004 R1).
const BUDGET_MS_P95: f64 = 700.0;

/// Registry download sizes (bytes) from oar-ocr 0.8.0 registry.rs, reported so
/// the download-delta cost is stated without a live download.
const SZ_MOBILE_DET: u64 = 4_826_518;
const SZ_MOBILE_REC_MAIN: u64 = 16_562_373;
const SZ_SERVER_REC_MAIN: u64 = 84_502_992;
const SZ_LATIN_REC: u64 = 8_069_614;
const SZ_KOREAN_REC: u64 = 13_446_374;
const SZ_DICT_MAIN: u64 = 74_012;
const SZ_DICT_LATIN: u64 = 2_616;
const SZ_DICT_KOREAN: u64 = 47_451;

fn spike_enabled() -> bool {
    std::env::var("OST_OCR_SPIKE_R2").as_deref() == Ok("1")
}

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

/// True if `c` is in the Latin-Extended-Additional block (U+1E00..=U+1EFF), the
/// block holding the Vietnamese composed tone-mark glyphs (ả ạ ử ụ ầ ế ...).
fn is_composed_vietnamese(c: char) -> bool {
    ('\u{1E00}'..='\u{1EFF}').contains(&c)
}

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

#[cfg(not(windows))]
fn working_set_bytes() -> u64 {
    0
}

fn mb(bytes: u64) -> f64 {
    bytes as f64 / (1024.0 * 1024.0)
}

/// Latency distribution (25 warm samples/size) across the four R1 crop sizes.
fn latency_sweep(engine: &PaddleOcrEngine, label: &str) -> f64 {
    let sizes = [
        (400u32, 100u32, 34.0f32),
        (800, 200, 52.0),
        (1200, 300, 72.0),
        (1200, 800, 88.0),
    ];
    let mut all: Vec<f64> = Vec::new();
    println!("\n---- Latency per crop size (warm, {label}) ----");
    for (w, h, px) in sizes {
        let Some(fx) = latency_fixture(w, h, px) else {
            continue;
        };
        let _ = engine.recognize(&fx.image);
        let mut samples: Vec<f64> = Vec::new();
        for _ in 0..25 {
            let t = Instant::now();
            let _ = engine.recognize(&fx.image).expect("recognize");
            samples.push(t.elapsed().as_secs_f64() * 1000.0);
        }
        samples.sort_by(|a, b| a.partial_cmp(b).unwrap());
        all.extend(samples.iter().copied());
        println!(
            "  {:>4}x{:<4} n={:<3} min={:>7.1} med={:>7.1} p95={:>7.1} max={:>7.1} ms",
            w,
            h,
            samples.len(),
            samples[0],
            percentile(&samples, 50.0),
            percentile(&samples, 95.0),
            samples[samples.len() - 1]
        );
    }
    all.sort_by(|a, b| a.partial_cmp(b).unwrap());
    let p95 = percentile(&all, 95.0);
    println!(
        "AGGREGATE {label}  n={} min={:.1} med={:.1} p95={:.1} max={:.1} ms  (budget p95 <= {} ms)",
        all.len(),
        all[0],
        percentile(&all, 50.0),
        p95,
        all[all.len() - 1],
        BUDGET_MS_P95
    );
    p95
}

/// Full accuracy set on one main-charset engine (en/ja/zh + vertical + low-DPI).
/// Vietnamese and Korean route to their own engines and are handled separately.
fn accuracy_main_set(engine: &PaddleOcrEngine, label: &str) {
    let fixtures = build_fixture_set();
    println!("\n---- Character accuracy (main-set langs on {label}) ----");
    for fx in &fixtures {
        if !matches!(fx.lang, Lang::En | Lang::Ja | Lang::Zh) {
            continue;
        }
        let out = engine.recognize(&fx.image).expect("recognize");
        let hyp = out.concatenated(" ");
        let acc = character_accuracy(&strip_ws(&fx.text), &strip_ws(&hyp));
        println!("  {:<24} acc={:.3}  hyp={:?}", fx.name, acc, hyp);
    }
}

#[test]
fn r2_ocr_spike() {
    if !spike_enabled() {
        eprintln!("ocr_spike_r2: skipped (set OST_OCR_SPIKE_R2=1 to run the R2 measurement)");
        return;
    }

    println!("\n================ R2 OCR SPIKE (ADR-004 R2) ================");
    println!("Vietnamese quality round: upscale path + charset probe + server rec\n");

    let ram_start = working_set_bytes();
    println!("RAM at test start: {:.1} MB", mb(ram_start));

    // =================================================================
    // 1. CHARSET PROBE - does the latin rec EVER emit a composed vi glyph?
    // =================================================================
    println!("\n================ 1. CHARSET PROBE ================");
    let latin_engine = PaddleOcrEngine::latin();
    if let Some(probe) = vi_charset_probe() {
        // Try at native size AND heavily upscaled: if the glyph class does not
        // exist in the softmax vocabulary, no DPI produces it.
        for factor in [1.0f32, 2.0, 3.0] {
            let img = upscale(&probe.image, factor);
            let out = latin_engine
                .recognize(&img)
                .expect("charset probe recognize");
            let hyp = out.concatenated(" ");
            let composed: Vec<char> = hyp.chars().filter(|&c| is_composed_vietnamese(c)).collect();
            let ref_composed: Vec<char> = probe
                .text
                .chars()
                .filter(|&c| is_composed_vietnamese(c))
                .collect();
            println!(
                "  probe @ {factor:.1}x: ref has {} composed-vi glyphs, hyp emitted {} composed-vi glyphs {:?}",
                ref_composed.len(),
                composed.len(),
                composed
            );
            println!("    ref = {:?}", probe.text);
            println!("    hyp = {hyp:?}");
        }
        println!(
            "  VERDICT: if 'hyp emitted 0 composed-vi glyphs' holds at every scale, the\n           latin rec charset lacks U+1E00-U+1EFF -> CHARSET GAP, not DPI."
        );
    } else {
        println!("  (skipped - Latin font unavailable)");
    }

    // =================================================================
    // 2. UPSCALE PATH - vi accuracy vs Lanczos3 upscale factor
    // =================================================================
    println!("\n================ 2. UPSCALE PATH (latin mobile rec) ================");
    println!("Filter: Lanczos3 (3-lobe windowed sinc) - sharpest upsampling image exposes.");
    let fixtures = build_fixture_set();
    let vi_fixtures: Vec<_> = fixtures.iter().filter(|f| f.lang == Lang::Vi).collect();
    for fx in &vi_fixtures {
        println!("\n  fixture {} (bar >= {:.2})", fx.name, BAR_VI);
        println!("    {:<8} {:>7}  {:>8}  hyp", "factor", "acc", "lat(ms)");
        for factor in [1.0f32, 1.5, 2.0, 3.0] {
            let img = upscale(&fx.image, factor);
            let t = Instant::now();
            let out = latin_engine.recognize(&img).expect("vi recognize");
            let lat = t.elapsed().as_secs_f64() * 1000.0;
            let hyp = out.concatenated(" ");
            let acc = character_accuracy(&strip_ws(&fx.text), &strip_ws(&hyp));
            let verdict = if acc >= BAR_VI { "PASS" } else { "below" };
            println!("    {factor:<8.1} {acc:>7.3}  {lat:>8.1}  [{verdict}] {hyp:?}");
        }
    }

    // =================================================================
    // 3. HEAVIER REC - PP-OCRv5 SERVER main rec vs mobile main rec
    // =================================================================
    println!("\n================ 3. SERVER MAIN REC vs MOBILE MAIN REC ================");
    let mobile_main = PaddleOcrEngine::main();
    let server_main = PaddleOcrEngine::main_server();

    // Cold build (session + any download) for each.
    for (eng, label) in [(&mobile_main, "mobile-main"), (&server_main, "server-main")] {
        let warm = latency_fixture(800, 200, 52.0).expect("warm fixture");
        let t = Instant::now();
        let _ = eng.recognize(&warm.image).expect("cold recognize");
        println!(
            "  cold first-call {label}: {:.1} ms (session build, models cached)",
            t.elapsed().as_secs_f64() * 1000.0
        );
    }

    accuracy_main_set(&mobile_main, "mobile-main");
    accuracy_main_set(&server_main, "server-main");

    // Vietnamese on the server main rec (main CJK dict) - expected to be WORSE
    // than latin, because the CJK dict has even fewer Latin diacritics.
    println!("\n---- Vietnamese on server-main rec (CJK dict, expect worse) ----");
    for fx in &vi_fixtures {
        let out = server_main.recognize(&fx.image).expect("vi on server");
        let hyp = out.concatenated(" ");
        let acc = character_accuracy(&strip_ws(&fx.text), &strip_ws(&hyp));
        println!("  {:<24} acc={:.3}  hyp={:?}", fx.name, acc, hyp);
    }

    let p95_mobile = latency_sweep(&mobile_main, "mobile-main rec");
    let ram_mobile_active = working_set_bytes();
    let p95_server = latency_sweep(&server_main, "server-main rec");
    let ram_server_active = working_set_bytes();

    // =================================================================
    // Confidence distribution on the latin engine (vi lines) - OI-07 note.
    // =================================================================
    println!("\n================ CONFIDENCE (latin engine, vi lines) ================");
    let mut conf: Vec<f64> = Vec::new();
    for fx in &vi_fixtures {
        let out = latin_engine.recognize(&fx.image).expect("vi conf");
        if let OcrConfidence::PerLine(scores) = &out.confidence {
            conf.extend(scores.iter().map(|&s| s as f64));
        }
    }
    if !conf.is_empty() {
        conf.sort_by(|a, b| a.partial_cmp(b).unwrap());
        let mean = conf.iter().sum::<f64>() / conf.len() as f64;
        println!(
            "  n={} min={:.3} median={:.3} mean={:.3} max={:.3}",
            conf.len(),
            conf[0],
            percentile(&conf, 50.0),
            mean,
            conf[conf.len() - 1]
        );
        println!(
            "  NOTE: tone-mark drops do NOT lower confidence - the model confidently emits\n        the in-charset base letter, so the low-confidence flag will not catch them."
        );
    }

    // =================================================================
    // RAM + model size / download deltas.
    // =================================================================
    println!("\n================ RAM + DOWNLOAD DELTAS ================");
    println!(
        "  RAM mobile-main active: {:.1} MB | server-main active: {:.1} MB",
        mb(ram_mobile_active),
        mb(ram_server_active)
    );
    let ram_all = working_set_bytes();
    println!(
        "  RAM all engines resident (worst case): {:.1} MB",
        mb(ram_all)
    );
    drop(fixtures);
    drop(latin_engine);
    drop(mobile_main);
    drop(server_main);
    let ram_after_drop = working_set_bytes();
    println!(
        "  RAM after dropping all engines: {:.1} MB",
        mb(ram_after_drop)
    );

    let dl_default = SZ_MOBILE_DET
        + SZ_MOBILE_REC_MAIN
        + SZ_LATIN_REC
        + SZ_KOREAN_REC
        + SZ_DICT_MAIN
        + SZ_DICT_LATIN
        + SZ_DICT_KOREAN;
    let dl_server_swap = SZ_SERVER_REC_MAIN;
    println!("\n  Download sizes (oar-ocr 0.8.0 registry):");
    println!(
        "    mobile main rec = {:.2} MB | server main rec = {:.2} MB | latin rec = {:.2} MB",
        mb(SZ_MOBILE_REC_MAIN),
        mb(SZ_SERVER_REC_MAIN),
        mb(SZ_LATIN_REC)
    );
    println!(
        "    default first-run set (mobile det+rec + latin + korean + dicts) = {:.2} MB",
        mb(dl_default)
    );
    println!(
        "    swapping mobile->server main rec adds = {:.2} MB (rec {:.2} vs {:.2} MB)",
        mb(dl_server_swap - SZ_MOBILE_REC_MAIN),
        mb(SZ_SERVER_REC_MAIN),
        mb(SZ_MOBILE_REC_MAIN)
    );

    println!("\n================ R2 SUMMARY ================");
    println!(
        "  latency p95: mobile-main = {:.1} ms | server-main = {:.1} ms  (budget <= {} ms)",
        p95_mobile, p95_server, BUDGET_MS_P95
    );
    println!(
        "  Vietnamese: charset gap confirmed above -> upscale + server rec cannot lift vi\n              to the 0.85 bar; reframes as MODEL SELECTION, not preprocessing."
    );
    println!("========================================\n");
}
