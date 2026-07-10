//! Dependency-free process RAM + CPU probe used to VERIFY the idle budget
//! (AC-05.1: idle RAM < 100MB, CPU < 1% averaged over a window) and the
//! return-to-idle window (AC-05.4).
//!
//! Like the RAM read in `stt::hardware`, this avoids adding a crate for a couple
//! of Win32 reads: process working-set size via `K32GetProcessMemoryInfo`
//! (exported by kernel32 since Windows 7, so no `psapi` link) and process CPU
//! time via `GetProcessTimes`. CPU utilisation is a DELTA over a wall-clock
//! window, normalised by the logical-processor count so `1%` means one percent of
//! the whole machine (matching the budget's intent).
//!
//! The probe never fails: an unreadable value becomes `None`/`0.0`. It is a
//! MEASUREMENT tool - the numbers are only meaningful against a real running
//! process (see `examples/idle_probe.rs`), so unit tests here assert the probe is
//! panic-free and internally consistent, not a specific machine figure.

use std::time::{Duration, Instant};

/// Bytes in one mebibyte, for reporting.
pub const BYTES_PER_MIB: u64 = 1024 * 1024;

/// A point-in-time resource reading for this process.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct ResourceSample {
    /// Resident working-set size in bytes (`None` if the probe could not read
    /// it, e.g. on a non-Windows Phase-4 host without a probe yet).
    pub working_set_bytes: Option<u64>,
    /// Process CPU utilisation over the sampling window, as a percentage of TOTAL
    /// machine capacity (0-100, summed across logical processors).
    pub cpu_percent: f64,
}

impl ResourceSample {
    /// Working-set size in whole MiB, if known (convenience for reporting).
    #[must_use]
    pub fn working_set_mib(&self) -> Option<f64> {
        self.working_set_bytes
            .map(|bytes| bytes as f64 / BYTES_PER_MIB as f64)
    }
}

/// A CPU-time / wall-clock reading, captured twice to compute a utilisation
/// delta across a window without pulling in a system-info crate.
#[derive(Debug, Clone, Copy)]
struct CpuSnapshot {
    /// Total process CPU time (kernel + user) in 100-nanosecond units.
    proc_100ns: u64,
    /// Wall-clock instant the snapshot was taken.
    wall: Instant,
}

/// Reads this process's RAM and CPU. Stateless; construct freely.
#[derive(Debug, Clone, Copy, Default)]
pub struct ProcessResourceProbe;

impl ProcessResourceProbe {
    /// A fresh probe.
    #[must_use]
    pub fn new() -> Self {
        Self
    }

    /// Current resident working-set size in bytes, or `None` if unreadable.
    #[must_use]
    pub fn working_set_bytes(&self) -> Option<u64> {
        working_set_bytes()
    }

    /// Samples CPU utilisation across `window` (blocking for its duration) and
    /// reads the working-set size at the end. `window` should be long enough to
    /// average out scheduler jitter (AC-05.1 uses a 5-minute window; a few
    /// seconds is enough to confirm a near-zero idle figure in a probe run).
    #[must_use]
    pub fn sample_over(&self, window: Duration) -> ResourceSample {
        let start = cpu_snapshot();
        std::thread::sleep(window);
        let end = cpu_snapshot();
        let cpu_percent = match (start, end) {
            (Some(start), Some(end)) => cpu_percent_between(start, end),
            _ => 0.0,
        };
        ResourceSample {
            working_set_bytes: self.working_set_bytes(),
            cpu_percent,
        }
    }
}

/// Logical-processor count used to normalise CPU utilisation to whole-machine
/// percent. Falls back to 1 if the count is unavailable (never divides by zero).
fn logical_cpus() -> f64 {
    std::thread::available_parallelism()
        .map(|n| n.get() as f64)
        .unwrap_or(1.0)
}

/// Percentage of total machine CPU used between two snapshots. Clamped to
/// `[0, 100]` (a tiny wall delta or a clock quirk can never yield a nonsense
/// figure).
fn cpu_percent_between(start: CpuSnapshot, end: CpuSnapshot) -> f64 {
    let wall_100ns = end.wall.duration_since(start.wall).as_nanos() as f64 / 100.0;
    if wall_100ns <= 0.0 {
        return 0.0;
    }
    let proc_delta = end.proc_100ns.saturating_sub(start.proc_100ns) as f64;
    let percent = 100.0 * proc_delta / (wall_100ns * logical_cpus());
    percent.clamp(0.0, 100.0)
}

#[cfg(windows)]
fn cpu_snapshot() -> Option<CpuSnapshot> {
    #[repr(C)]
    #[derive(Clone, Copy)]
    struct FileTime {
        dw_low_date_time: u32,
        dw_high_date_time: u32,
    }

    extern "system" {
        fn GetCurrentProcess() -> isize;
        fn GetProcessTimes(
            process: isize,
            creation: *mut FileTime,
            exit: *mut FileTime,
            kernel: *mut FileTime,
            user: *mut FileTime,
        ) -> i32;
    }

    let mut creation = FileTime {
        dw_low_date_time: 0,
        dw_high_date_time: 0,
    };
    let mut exit = creation;
    let mut kernel = creation;
    let mut user = creation;

    // SAFETY: pseudo-handle from GetCurrentProcess needs no close; GetProcessTimes
    // only writes into the four fully-owned FILETIME outs and returns nonzero on
    // success. No aliasing, no retained pointers.
    let ok = unsafe {
        GetProcessTimes(
            GetCurrentProcess(),
            &mut creation,
            &mut exit,
            &mut kernel,
            &mut user,
        )
    };
    if ok == 0 {
        return None;
    }
    let to_u64 = |ft: FileTime| ((ft.dw_high_date_time as u64) << 32) | ft.dw_low_date_time as u64;
    Some(CpuSnapshot {
        proc_100ns: to_u64(kernel) + to_u64(user),
        wall: Instant::now(),
    })
}

#[cfg(not(windows))]
fn cpu_snapshot() -> Option<CpuSnapshot> {
    // Non-Windows CPU sampling is a Phase-4 probe; report no CPU data so the
    // sample degrades to 0.0 rather than a wrong figure.
    None
}

#[cfg(windows)]
fn working_set_bytes() -> Option<u64> {
    #[repr(C)]
    struct ProcessMemoryCounters {
        cb: u32,
        page_fault_count: u32,
        peak_working_set_size: usize,
        working_set_size: usize,
        quota_peak_paged_pool_usage: usize,
        quota_paged_pool_usage: usize,
        quota_peak_nonpaged_pool_usage: usize,
        quota_nonpaged_pool_usage: usize,
        pagefile_usage: usize,
        peak_pagefile_usage: usize,
    }

    extern "system" {
        fn GetCurrentProcess() -> isize;
        // Exported by kernel32 since Windows 7 - avoids linking psapi for one read.
        fn K32GetProcessMemoryInfo(
            process: isize,
            counters: *mut ProcessMemoryCounters,
            cb: u32,
        ) -> i32;
    }

    let mut counters = ProcessMemoryCounters {
        cb: std::mem::size_of::<ProcessMemoryCounters>() as u32,
        page_fault_count: 0,
        peak_working_set_size: 0,
        working_set_size: 0,
        quota_peak_paged_pool_usage: 0,
        quota_paged_pool_usage: 0,
        quota_peak_nonpaged_pool_usage: 0,
        quota_nonpaged_pool_usage: 0,
        pagefile_usage: 0,
        peak_pagefile_usage: 0,
    };

    // SAFETY: `counters` is a fully-owned, correctly-sized PROCESS_MEMORY_COUNTERS
    // with `cb` set; the call only writes into it and returns nonzero on success.
    let ok = unsafe {
        K32GetProcessMemoryInfo(
            GetCurrentProcess(),
            &mut counters,
            std::mem::size_of::<ProcessMemoryCounters>() as u32,
        )
    };
    if ok != 0 {
        Some(counters.working_set_size as u64)
    } else {
        None
    }
}

#[cfg(not(windows))]
fn working_set_bytes() -> Option<u64> {
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn probe_never_panics_and_reports_plausible_ram_on_this_host() {
        let probe = ProcessResourceProbe::new();
        let bytes = probe.working_set_bytes();
        #[cfg(windows)]
        {
            let bytes = bytes.expect("Windows host must report a working set");
            // The test process itself holds a nonzero, sane working set.
            assert!(bytes > BYTES_PER_MIB, "expected > 1 MiB working set");
            assert!(bytes < 64 * 1024 * BYTES_PER_MIB, "implausibly large RAM");
        }
        #[cfg(not(windows))]
        let _ = bytes;
    }

    #[test]
    fn sample_over_a_short_window_yields_a_bounded_cpu_percent() {
        // A short idle sample: the probe must return a percentage in [0, 100] and
        // never panic. We do not assert a specific figure (machine-dependent), only
        // that the arithmetic is well-formed.
        let probe = ProcessResourceProbe::new();
        let sample = probe.sample_over(Duration::from_millis(50));
        assert!(
            (0.0..=100.0).contains(&sample.cpu_percent),
            "cpu_percent {} out of range",
            sample.cpu_percent
        );
        #[cfg(windows)]
        assert!(sample.working_set_mib().unwrap() > 1.0);
    }

    #[test]
    fn zero_wall_delta_reports_zero_cpu_not_a_divide_by_zero() {
        let now = Instant::now();
        let snap = CpuSnapshot {
            proc_100ns: 1_000,
            wall: now,
        };
        // Same wall instant -> no elapsed time -> 0.0, not NaN/inf.
        assert_eq!(cpu_percent_between(snap, snap), 0.0);
    }

    #[test]
    fn cpu_percent_is_normalised_by_logical_cpu_count() {
        // One full core busy for the whole window is 100/ncpus percent of the
        // machine, and always <= 100.
        let start = Instant::now();
        let window_100ns = 10_000_000u64; // 1 second in 100ns units
        let start_snap = CpuSnapshot {
            proc_100ns: 0,
            wall: start,
        };
        let end_snap = CpuSnapshot {
            proc_100ns: window_100ns, // one core fully used for the window
            wall: start + Duration::from_secs(1),
        };
        let percent = cpu_percent_between(start_snap, end_snap);
        let expected = 100.0 / logical_cpus();
        assert!(
            (percent - expected).abs() < 5.0,
            "expected ~{expected}% for one busy core, got {percent}%"
        );
        assert!(percent <= 100.0);
    }
}
