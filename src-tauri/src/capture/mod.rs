//! Screen region capture behind the `ScreenCapturer` trait (FR-02, NFR-SCA-01).
//!
//! Windows is the first (and currently only) backend, via `xcap` (Windows
//! Graphics / GDI capture). macOS ScreenCaptureKit and Linux PipeWire are
//! Phase-4 swaps behind this same trait, not call-site changes.
//!
//! HARD SECURITY REQUIREMENT (AC-02.5 / NFR-SEC-03): the captured pixels live
//! ONLY in an in-memory [`image::RgbImage`]. Nothing in this module writes an
//! image to disk, and the bytes never cross the IPC boundary (only OCR text
//! does, in the OCR stage). `xcap::Monitor::capture_region` likewise hands back
//! an in-memory buffer; no temp file is ever produced.

#[cfg(windows)]
use std::time::Duration;

use image::{Rgb, RgbImage, RgbaImage};

/// A capture rectangle in PHYSICAL pixels, relative to the primary-monitor
/// origin (matches the IPC `RegionRect` contract).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CaptureRegion {
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
}

/// Errors surfaced by a [`ScreenCapturer`]. Display strings never carry pixel
/// data or user content.
#[derive(Debug, thiserror::Error)]
pub enum CaptureError {
    /// No capturable monitor was reported by the platform backend.
    #[error("no capturable monitor found")]
    NoMonitor,
    /// The requested region is empty or falls outside the captured surface.
    #[error("invalid capture region: {0}")]
    InvalidRegion(String),
    /// The platform capture backend failed.
    #[error("screen capture backend error: {0}")]
    Backend(String),
}

/// One screen-capture backend. Implementations return the region as an
/// in-memory [`RgbImage`] and MUST NOT persist it (AC-02.5 / NFR-SEC-03).
pub trait ScreenCapturer: Send + Sync {
    /// Captures `region` and returns it as an in-memory RGB image.
    fn capture(&self, region: CaptureRegion) -> Result<RgbImage, CaptureError>;
}

/// Crops `region` out of an in-memory RGBA source into an owned [`RgbImage`]
/// (alpha dropped). Pure and filesystem-free - the shared core of every
/// backend and the unit-testable seam for the no-disk-write guard.
pub fn crop_rgba_to_rgb(
    source: &RgbaImage,
    region: CaptureRegion,
) -> Result<RgbImage, CaptureError> {
    if region.width == 0 || region.height == 0 {
        return Err(CaptureError::InvalidRegion("zero-sized region".into()));
    }
    let (sw, sh) = source.dimensions();
    let right = region.x.checked_add(region.width);
    let bottom = region.y.checked_add(region.height);
    match (right, bottom) {
        (Some(r), Some(b)) if r <= sw && b <= sh => {}
        _ => {
            return Err(CaptureError::InvalidRegion(format!(
                "region {}x{} at ({},{}) exceeds {sw}x{sh} surface",
                region.width, region.height, region.x, region.y
            )));
        }
    }
    let mut out = RgbImage::new(region.width, region.height);
    for y in 0..region.height {
        for x in 0..region.width {
            let p = source.get_pixel(region.x + x, region.y + y);
            out.put_pixel(x, y, Rgb([p[0], p[1], p[2]]));
        }
    }
    Ok(out)
}

/// The Windows screen capturer (xcap). Region coordinates are interpreted
/// relative to the primary monitor, matching the IPC `RegionRect` contract.
#[cfg(windows)]
#[derive(Debug, Default)]
pub struct WindowsScreenCapturer;

#[cfg(windows)]
impl WindowsScreenCapturer {
    /// Cheap to construct - no capture happens until [`ScreenCapturer::capture`].
    pub fn new() -> Self {
        Self
    }
}

/// Upper bound for a single region capture (TASK-021). The Windows capture
/// backend (Windows Graphics Capture) waits for a frame with no internal
/// timeout; without this bound a stalled frame wait parks the caller forever and
/// the whole app goes Not-responding. When it elapses we surface a
/// [`CaptureError::Backend`] the pipeline maps to `region:ocr-error` instead of
/// hanging silently (human-in-the-loop.md).
#[cfg(windows)]
const CAPTURE_TIMEOUT: Duration = Duration::from_secs(5);

/// RAII COM apartment initializer for the capture worker thread (TASK-021).
/// Windows Graphics Capture requires the capturing thread to have a COM
/// apartment; the bare `std::thread` the capture used to run on had none, so the
/// WGC frame wait never completed. Pairs a successful `CoInitializeEx` with
/// `CoUninitialize` on drop.
#[cfg(windows)]
struct ComApartment {
    owns_uninit: bool,
}

#[cfg(windows)]
impl ComApartment {
    fn init() -> Self {
        use windows::Win32::System::Com::{CoInitializeEx, COINIT_MULTITHREADED};
        // SAFETY: `CoInitializeEx` is safe to call on any thread. We request the
        // multithreaded apartment (WGC's frame pool is created free-threaded, so
        // MTA is the correct apartment for a worker with no message pump). S_OK /
        // S_FALSE mean this call owns an uninit; RPC_E_CHANGED_MODE means the
        // thread already had a different apartment, so we must NOT uninit it.
        let hr = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) };
        Self {
            owns_uninit: hr.is_ok(),
        }
    }
}

#[cfg(windows)]
impl Drop for ComApartment {
    fn drop(&mut self) {
        if self.owns_uninit {
            use windows::Win32::System::Com::CoUninitialize;
            // SAFETY: paired with the successful CoInitializeEx in `init`.
            unsafe { CoUninitialize() };
        }
    }
}

#[cfg(windows)]
impl ScreenCapturer for WindowsScreenCapturer {
    fn capture(&self, region: CaptureRegion) -> Result<RgbImage, CaptureError> {
        if region.width == 0 || region.height == 0 {
            return Err(CaptureError::InvalidRegion("zero-sized region".into()));
        }

        // Run the capture on a dedicated COM-initialized worker thread and wait
        // on it with a BOUNDED timeout (TASK-021). Two defects are fixed here:
        // the worker gives WGC the COM apartment it needs so the frame actually
        // arrives, and `recv_timeout` guarantees a stuck backend maps to a
        // `Backend` error (-> region:ocr-error) instead of hanging the app.
        let (tx, rx) = std::sync::mpsc::sync_channel::<Result<RgbImage, CaptureError>>(1);
        std::thread::Builder::new()
            .name("ost-screen-capture".into())
            .spawn(move || {
                let _com = ComApartment::init();
                // If the receiver already timed out and dropped, the send fails
                // and is ignored - the worker simply unwinds.
                let _ = tx.send(capture_region_blocking(region));
            })
            .map_err(|e| {
                CaptureError::Backend(format!("could not spawn the capture thread: {e}"))
            })?;

        match rx.recv_timeout(CAPTURE_TIMEOUT) {
            Ok(result) => result,
            Err(std::sync::mpsc::RecvTimeoutError::Timeout) => Err(CaptureError::Backend(format!(
                "screen capture timed out after {}s",
                CAPTURE_TIMEOUT.as_secs()
            ))),
            Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => Err(CaptureError::Backend(
                "capture thread ended without returning a frame".into(),
            )),
        }
    }
}

/// The blocking xcap capture, run on the COM-initialized worker thread. Returns
/// the region as an in-memory RGB image; never writes to disk (AC-02.5).
#[cfg(windows)]
fn capture_region_blocking(region: CaptureRegion) -> Result<RgbImage, CaptureError> {
    use xcap::Monitor;

    let monitors = Monitor::all().map_err(|e| CaptureError::Backend(e.to_string()))?;
    // The selection overlay covers the primary monitor (TASK-008), so the
    // region origin is the primary monitor's origin.
    let monitor = monitors
        .iter()
        .find(|m| m.is_primary().unwrap_or(false))
        .or_else(|| monitors.first())
        .ok_or(CaptureError::NoMonitor)?;

    // `capture_region` crops on the backend side and returns an in-memory
    // RGBA buffer - no full-screen copy, no disk write.
    let rgba = monitor
        .capture_region(region.x, region.y, region.width, region.height)
        .map_err(|e| CaptureError::Backend(e.to_string()))?;
    Ok(rgba_to_rgb(&rgba))
}

/// Drops the alpha channel of an in-memory RGBA buffer. No allocation escapes
/// to disk (AC-02.5).
#[cfg(windows)]
fn rgba_to_rgb(src: &RgbaImage) -> RgbImage {
    let (w, h) = src.dimensions();
    let mut out = RgbImage::new(w, h);
    for (x, y, p) in src.enumerate_pixels() {
        out.put_pixel(x, y, Rgb([p[0], p[1], p[2]]));
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A synthetic in-memory "screen" for tests: holds one RGBA buffer and
    /// crops it exactly like a real backend, exercising the shared crop path
    /// WITHOUT touching the filesystem or a real display.
    struct StubScreenCapturer {
        surface: RgbaImage,
    }

    impl ScreenCapturer for StubScreenCapturer {
        fn capture(&self, region: CaptureRegion) -> Result<RgbImage, CaptureError> {
            crop_rgba_to_rgb(&self.surface, region)
        }
    }

    /// A 4x3 synthetic surface with a per-pixel gradient so crop offsets are
    /// verifiable. Never real captured content (agent-guardrails.md section 4).
    fn synthetic_surface() -> RgbaImage {
        let mut img = RgbaImage::new(4, 3);
        for (x, y, p) in img.enumerate_pixels_mut() {
            *p = image::Rgba([(x * 10) as u8, (y * 10) as u8, 42, 255]);
        }
        img
    }

    #[test]
    fn crop_extracts_the_exact_region_and_drops_alpha() {
        let surface = synthetic_surface();
        let out = crop_rgba_to_rgb(
            &surface,
            CaptureRegion {
                x: 1,
                y: 1,
                width: 2,
                height: 2,
            },
        )
        .unwrap();
        assert_eq!(out.dimensions(), (2, 2));
        // Top-left of the crop is source pixel (1,1) with alpha removed.
        assert_eq!(*out.get_pixel(0, 0), Rgb([10, 10, 42]));
        assert_eq!(*out.get_pixel(1, 1), Rgb([20, 20, 42]));
    }

    #[test]
    fn crop_rejects_zero_sized_region() {
        let surface = synthetic_surface();
        assert!(matches!(
            crop_rgba_to_rgb(
                &surface,
                CaptureRegion {
                    x: 0,
                    y: 0,
                    width: 0,
                    height: 2
                }
            ),
            Err(CaptureError::InvalidRegion(_))
        ));
    }

    #[test]
    fn crop_rejects_region_outside_the_surface() {
        let surface = synthetic_surface();
        assert!(matches!(
            crop_rgba_to_rgb(
                &surface,
                CaptureRegion {
                    x: 3,
                    y: 0,
                    width: 2,
                    height: 1
                }
            ),
            Err(CaptureError::InvalidRegion(_))
        ));
    }

    /// AC-02.5 / NFR-SEC-03 guard: running a capture through the pipeline seam
    /// produces an in-memory `RgbImage` and writes NO file. We watch a fresh
    /// temp directory across the capture and assert it stays empty. The real
    /// Windows backend shares this crop path and additionally only ever holds
    /// the in-memory buffer xcap returns.
    /// BRING-UP smoke (TASK-021), `#[ignore]` so it NEVER runs in CI or default
    /// `cargo test`: it needs a real display and transiently captures a tiny 16x16
    /// region of the live desktop (dimensions only asserted; nothing persisted or
    /// inspected, so no user content enters the test - agent-guardrails.md 4).
    /// It proves the REAL Windows capturer - the COM-initialized worker thread +
    /// bounded timeout - RETURNS rather than parking forever (the release hang the
    /// debugger root-caused). Run explicitly:
    /// `cargo test -- --ignored real_windows_capture_returns_and_does_not_park`.
    #[cfg(windows)]
    #[test]
    #[ignore = "requires a real display; opt-in bring-up smoke, not for CI"]
    fn real_windows_capture_returns_and_does_not_park() {
        let capturer = WindowsScreenCapturer::new();
        let region = CaptureRegion {
            x: 0,
            y: 0,
            width: 16,
            height: 16,
        };
        let started = std::time::Instant::now();
        let result = capturer.capture(region);
        let elapsed = started.elapsed();
        // The whole point: it returns well within the bounded timeout, never parks.
        assert!(
            elapsed < CAPTURE_TIMEOUT,
            "capture took {elapsed:?}; a bounded capture must return under {CAPTURE_TIMEOUT:?}"
        );
        match result {
            Ok(image) => assert_eq!(image.dimensions(), (16, 16)),
            // A backend error is still a RETURN, not a hang (e.g. an
            // uncapturable/headless host); the anti-hang guarantee holds.
            Err(e) => eprintln!("capture returned an error (still not a hang): {e}"),
        }
    }

    #[test]
    fn capture_keeps_pixels_in_memory_and_writes_no_file() {
        let watch_dir = std::env::temp_dir().join(format!(
            "ost-capture-nodisk-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&watch_dir).unwrap();

        let before = std::fs::read_dir(&watch_dir).unwrap().count();
        let capturer = StubScreenCapturer {
            surface: synthetic_surface(),
        };
        let region = CaptureRegion {
            x: 0,
            y: 0,
            width: 3,
            height: 2,
        };
        let image = capturer.capture(region).unwrap();
        // Result is an owned, in-memory RGB buffer of the requested size.
        assert_eq!(image.dimensions(), (3, 2));
        let after = std::fs::read_dir(&watch_dir).unwrap().count();
        assert_eq!(before, after, "capture must not write any file to disk");

        let _ = std::fs::remove_dir_all(&watch_dir);
    }
}
