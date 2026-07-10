//! Hardware probe -> whisper model-size recommendation (BR-08 / AC-01.8).
//!
//! At first run the app probes the machine (RAM, GPU) and recommends a whisper
//! model size; the download only starts after the user confirms (the consent
//! gate). The recommendation logic ([`recommend_model`]) is a PURE function of a
//! [`HardwareProfile`] so it is unit-tested exhaustively without touching real
//! hardware; the probe ([`probe_hardware`]) is a thin, best-effort platform
//! read that fills the profile.
//!
//! Rationale for the tiers: whisper.cpp inference here is CPU-bound (the MVP
//! build has no GPU feature), and a larger model is slower - the p95 < 3s
//! end-to-end budget (NFR) caps how large we recommend for CPU-only machines.
//! `Medium` is only recommended when a GPU is present (a Phase-4 GPU backend
//! will use it); on CPU we top out at `Small` to protect the latency budget.

use super::model::WhisperModelSize;

const GIB: u64 = 1024 * 1024 * 1024;

/// A snapshot of the machine's relevant capabilities for model sizing.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct HardwareProfile {
    /// Total physical RAM in bytes (0 if the probe could not read it).
    pub total_ram_bytes: u64,
    /// Whether a usable acceleration GPU was detected. The MVP whisper build is
    /// CPU-only, so this is best-effort and drives only the `Medium` ceiling
    /// (a Phase-4 GPU backend consumes it); the probe reports `false` today.
    pub has_gpu: bool,
}

impl HardwareProfile {
    /// Total RAM expressed in whole GiB (floored).
    #[must_use]
    pub fn ram_gib(&self) -> u64 {
        self.total_ram_bytes / GIB
    }
}

/// Recommends a whisper model size from a hardware profile (BR-08).
///
/// RAM tiers pick the baseline; a detected GPU lifts the ceiling to `Medium`
/// only on high-RAM machines. Deterministic and total (every profile maps to a
/// size), so it is fully unit-tested.
#[must_use]
pub fn recommend_model(profile: &HardwareProfile) -> WhisperModelSize {
    // Unknown RAM (probe failed): pick the safe, broadly-runnable default.
    if profile.total_ram_bytes == 0 {
        return WhisperModelSize::Base;
    }
    let gib = profile.ram_gib();
    let cpu_baseline = if gib < 4 {
        WhisperModelSize::Tiny
    } else if gib < 8 {
        WhisperModelSize::Base
    } else {
        // 8 GiB and up: Small is the CPU-latency-safe ceiling.
        WhisperModelSize::Small
    };

    // A GPU (Phase-4 backend) can afford Medium on high-RAM machines. On the
    // CPU-only MVP build `has_gpu` is false, so this branch stays dormant.
    if profile.has_gpu && gib >= 16 {
        WhisperModelSize::Medium
    } else {
        cpu_baseline
    }
}

/// Probes the machine's RAM and GPU (best-effort). Never fails: an unreadable
/// value becomes `0` / `false` and [`recommend_model`] falls back to a safe
/// default. No heavy dependency - RAM is read via a tiny Win32 FFI on Windows.
#[must_use]
pub fn probe_hardware() -> HardwareProfile {
    HardwareProfile {
        total_ram_bytes: total_ram_bytes().unwrap_or(0),
        // GPU acceleration is a Phase-4 backend; the CPU-only MVP build never
        // uses a GPU, so we report false rather than imply an unused capability.
        has_gpu: false,
    }
}

#[cfg(windows)]
fn total_ram_bytes() -> Option<u64> {
    // Minimal Win32 FFI to GlobalMemoryStatusEx - avoids a new dependency for a
    // single read. kernel32 is linked by default on the Windows target.
    #[repr(C)]
    struct MemoryStatusEx {
        dw_length: u32,
        dw_memory_load: u32,
        ull_total_phys: u64,
        ull_avail_phys: u64,
        ull_total_page_file: u64,
        ull_avail_page_file: u64,
        ull_total_virtual: u64,
        ull_avail_virtual: u64,
        ull_avail_extended_virtual: u64,
    }

    extern "system" {
        fn GlobalMemoryStatusEx(buffer: *mut MemoryStatusEx) -> i32;
    }

    // SAFETY: `status` is a fully-owned, correctly-sized MEMORYSTATUSEX with
    // `dw_length` set as the API requires; GlobalMemoryStatusEx only writes into
    // it and returns nonzero on success. No aliasing, no retained pointer.
    let mut status = MemoryStatusEx {
        dw_length: std::mem::size_of::<MemoryStatusEx>() as u32,
        dw_memory_load: 0,
        ull_total_phys: 0,
        ull_avail_phys: 0,
        ull_total_page_file: 0,
        ull_avail_page_file: 0,
        ull_total_virtual: 0,
        ull_avail_virtual: 0,
        ull_avail_extended_virtual: 0,
    };
    let ok = unsafe { GlobalMemoryStatusEx(&mut status) };
    if ok != 0 {
        Some(status.ull_total_phys)
    } else {
        None
    }
}

#[cfg(not(windows))]
fn total_ram_bytes() -> Option<u64> {
    // Non-Windows platforms are Phase-4; the probe returns None so the
    // recommendation falls back to the safe default until a real probe lands.
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    fn profile(ram_gib: u64, has_gpu: bool) -> HardwareProfile {
        HardwareProfile {
            total_ram_bytes: ram_gib * GIB,
            has_gpu,
        }
    }

    #[test]
    fn low_ram_recommends_tiny() {
        assert_eq!(recommend_model(&profile(2, false)), WhisperModelSize::Tiny);
        assert_eq!(recommend_model(&profile(3, false)), WhisperModelSize::Tiny);
    }

    #[test]
    fn mid_ram_recommends_base() {
        assert_eq!(recommend_model(&profile(4, false)), WhisperModelSize::Base);
        assert_eq!(recommend_model(&profile(6, false)), WhisperModelSize::Base);
    }

    #[test]
    fn high_ram_cpu_tops_out_at_small() {
        // CPU-only: Small is the latency-safe ceiling even at 32 GiB (p95 < 3s).
        assert_eq!(recommend_model(&profile(8, false)), WhisperModelSize::Small);
        assert_eq!(
            recommend_model(&profile(16, false)),
            WhisperModelSize::Small
        );
        assert_eq!(
            recommend_model(&profile(32, false)),
            WhisperModelSize::Small
        );
    }

    #[test]
    fn gpu_with_high_ram_recommends_medium() {
        assert_eq!(
            recommend_model(&profile(16, true)),
            WhisperModelSize::Medium
        );
        assert_eq!(
            recommend_model(&profile(32, true)),
            WhisperModelSize::Medium
        );
    }

    #[test]
    fn gpu_with_low_ram_does_not_jump_to_medium() {
        // A GPU does not rescue a RAM-starved machine.
        assert_eq!(recommend_model(&profile(8, true)), WhisperModelSize::Small);
        assert_eq!(recommend_model(&profile(4, true)), WhisperModelSize::Base);
    }

    #[test]
    fn unknown_ram_falls_back_to_base() {
        let unknown = HardwareProfile {
            total_ram_bytes: 0,
            has_gpu: false,
        };
        assert_eq!(recommend_model(&unknown), WhisperModelSize::Base);
    }

    #[test]
    fn probe_never_panics_and_reports_ram_on_this_host() {
        // The real probe on the dev/CI host: never panics, and on Windows reads
        // a plausible nonzero RAM figure.
        let p = probe_hardware();
        #[cfg(windows)]
        assert!(p.total_ram_bytes > GIB, "expected > 1 GiB total RAM");
        #[cfg(not(windows))]
        let _ = p;
    }
}
