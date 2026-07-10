//! Idle-budget probe (FR-05 / AC-05.1 / AC-05.4 / BR-04).
//!
//! Measures THIS process's resident RAM and CPU in the true-idle state - the
//! heavy-session coordinator constructed but NO model loaded (whisper/ORT load
//! lazily and are unloaded on session end). This is the Rust-core idle footprint;
//! the shipped Tauri app additionally hosts the system WebView, which is outside
//! this crate's control and measured separately in the e2e budget checks.
//!
//! It is an EXAMPLE (not a default test) because a meaningful number needs a real
//! running process and a wall-clock window; it downloads nothing and loads no
//! model (testing.md: no real models by default).
//!
//! Run:  cargo run --example idle_probe -- [window_seconds]
//! e.g.  cargo run --example idle_probe -- 10

use std::sync::Arc;
use std::time::Duration;

use ost_lib::core::{HeavySessionCoordinator, HeavySessionKind, ProcessResourceProbe};

fn main() {
    let window_secs: u64 = std::env::args()
        .nth(1)
        .and_then(|a| a.parse().ok())
        .unwrap_or(5);

    // Construct the coordinator and register two lightweight unloaders, exactly as
    // the pipelines do at wiring time - but load NO model. This is the resting
    // state the app sits in when no session is active.
    let coordinator = Arc::new(HeavySessionCoordinator::new());
    coordinator.register(HeavySessionKind::Ocr, Arc::new(|| {}));
    coordinator.register(HeavySessionKind::Stt, Arc::new(|| {}));
    // A start/stop cycle then leaves nothing resident (return-to-idle, AC-05.4).
    coordinator.begin(HeavySessionKind::Stt);
    coordinator.end(HeavySessionKind::Stt);
    assert_eq!(coordinator.active(), None);

    let probe = ProcessResourceProbe::new();
    println!(
        "idle_probe: sampling process RAM + CPU over {window_secs}s (true idle, no model loaded)"
    );
    let sample = probe.sample_over(Duration::from_secs(window_secs));

    match sample.working_set_mib() {
        Some(mib) => {
            let verdict = if mib < 100.0 { "PASS" } else { "OVER BUDGET" };
            println!("idle RAM   : {mib:.1} MiB (budget < 100 MiB) -> {verdict}");
        }
        None => println!("idle RAM   : unavailable on this platform"),
    }
    let cpu_verdict = if sample.cpu_percent < 1.0 {
        "PASS"
    } else {
        "OVER BUDGET"
    };
    println!(
        "idle CPU   : {:.3}% of machine (budget < 1%) -> {cpu_verdict}",
        sample.cpu_percent
    );
    println!(
        "active heavy session after start/stop cycle: {:?}",
        coordinator.active()
    );
}
