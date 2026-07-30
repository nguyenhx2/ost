//! Windows WASAPI backends for [`AudioSource`] (FR-01, first impl).
//!
//! Two endpoints share one WASAPI shared-mode client lifecycle
//! ([`WasapiPcmSource`]):
//! - [`WindowsLoopbackSource`] captures whatever is playing to the default
//!   render endpoint (system audio) by opening that render device in loopback
//!   capture mode - the default source (FR-01).
//! - [`WindowsMicrophoneSource`] captures the default capture endpoint
//!   (microphone) directly, no loopback flag.
//!
//! These are the ONLY platform impls today; macOS ScreenCaptureKit and Linux
//! PipeWire are Phase-4 swaps behind the same [`AudioSource`] trait
//! (NFR-SCA-01), not call-site changes.
//!
//! Threading: the COM/WASAPI client is created lazily on the FIRST `read`,
//! which the session runs on its dedicated capture thread, so all interface
//! use stays on one MTA thread. `new()` does a cheap probe (the endpoint's mix
//! format) only to report [`AudioFormat`] before the thread starts, then drops
//! those objects.
//!
//! HARD SECURITY REQUIREMENT (AC-01.6 / BR-01): captured frames are converted
//! to in-memory mono `f32` and handed straight to the pipeline. Nothing here
//! writes audio to disk or a network payload.

use std::collections::VecDeque;

use wasapi::{
    initialize_mta, AudioCaptureClient, AudioClient, DeviceEnumerator, Direction, Handle,
    SampleType, StreamMode, WaveFormat,
};

use crate::audio::source::{AudioFormat, AudioSource, CaptureError};

/// Milliseconds `read` waits for the next buffer event before yielding an empty
/// read. Bounded so the session's stop flag is seen within this interval,
/// keeping stop well under the 1s budget (AC-01.10).
const EVENT_TIMEOUT_MS: u32 = 200;

/// Which default endpoint a [`WasapiPcmSource`] opens. The client-init
/// direction passed to `initialize_client` is always [`Direction::Capture`];
/// the `wasapi` crate derives the loopback stream flag from the endpoint's own
/// dataflow (render vs. capture), so opening the render endpoint this way is
/// what turns capture into loopback - see `initialize_client` in the `wasapi`
/// crate.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum WindowsEndpoint {
    /// Default render (playback) endpoint, opened in loopback mode.
    RenderLoopback,
    /// Default capture (microphone) endpoint.
    Capture,
}

impl WindowsEndpoint {
    /// Direction used to look up the DEFAULT endpoint via [`DeviceEnumerator`].
    fn device_direction(self) -> Direction {
        match self {
            WindowsEndpoint::RenderLoopback => Direction::Render,
            WindowsEndpoint::Capture => Direction::Capture,
        }
    }
}

/// Shared WASAPI shared-mode capture implementation for both endpoints. Not
/// exported: [`WindowsLoopbackSource`] and [`WindowsMicrophoneSource`] are
/// thin, distinctly-named wrappers so callers pick a backend by type, not by
/// a runtime flag.
struct WasapiPcmSource {
    endpoint: WindowsEndpoint,
    sample_rate: u32,
    channels: u16,
    inner: Option<Inner>,
}

/// The live WASAPI client and its capture-side state. Created and used ONLY on
/// the capture thread (see module note); never shared.
struct Inner {
    client: AudioClient,
    capture: AudioCaptureClient,
    event: Handle,
    queue: VecDeque<u8>,
    blockalign: usize,
    channels: usize,
}

// SAFETY: `Inner` holds COM interface pointers that are not auto-`Send`. The
// value is constructed lazily inside `read` on the session's single capture
// thread and is only ever touched from that thread; it is never accessed
// concurrently. `WasapiPcmSource` is moved to the capture thread while
// `inner` is still `None`, so no COM pointer actually crosses a thread
// boundary. COM is initialized MTA on that thread before any interface use.
unsafe impl Send for WasapiPcmSource {}

impl WasapiPcmSource {
    /// Probes the given endpoint to learn its mix format, so
    /// [`AudioSource::format`] is answerable before capture starts. The heavy
    /// client is built later, on the capture thread.
    fn new(endpoint: WindowsEndpoint) -> Result<Self, CaptureError> {
        initialize_mta()
            .ok()
            .map_err(|e| CaptureError::Init(e.to_string()))?;
        let enumerator = DeviceEnumerator::new().map_err(|e| CaptureError::Init(e.to_string()))?;
        let device = enumerator
            .get_default_device(&endpoint.device_direction())
            .map_err(|_| CaptureError::NoEndpoint)?;
        let client = device
            .get_iaudioclient()
            .map_err(|e| CaptureError::Init(e.to_string()))?;
        let mix = client
            .get_mixformat()
            .map_err(|e| CaptureError::Init(e.to_string()))?;
        Ok(Self {
            endpoint,
            sample_rate: mix.get_samplespersec(),
            channels: mix.get_nchannels(),
            inner: None,
        })
    }

    /// Builds the live client on the current (capture) thread.
    fn init_inner(&self) -> Result<Inner, CaptureError> {
        // Ensure this thread shares the process MTA before touching COM.
        initialize_mta()
            .ok()
            .map_err(|e| CaptureError::Init(e.to_string()))?;
        let enumerator = DeviceEnumerator::new().map_err(|e| CaptureError::Init(e.to_string()))?;
        let device = enumerator
            .get_default_device(&self.endpoint.device_direction())
            .map_err(|_| CaptureError::NoEndpoint)?;
        let mut client = device
            .get_iaudioclient()
            .map_err(|e| CaptureError::Init(e.to_string()))?;

        // Request float32 at the device's native rate/channels; autoconvert lets
        // WASAPI hand us f32 regardless of the endpoint's internal format.
        let format = WaveFormat::new(
            32,
            32,
            &SampleType::Float,
            self.sample_rate as usize,
            self.channels as usize,
            None,
        );
        let (_default_period, min_period) = client
            .get_device_period()
            .map_err(|e| CaptureError::Init(e.to_string()))?;
        let mode = StreamMode::EventsShared {
            autoconvert: true,
            buffer_duration_hns: min_period,
        };
        // Client-init direction is always Capture: on a Render endpoint that
        // yields loopback (the `wasapi` crate sets AUDCLNT_STREAMFLAGS_LOOPBACK
        // for that combination); on a Capture endpoint it is a plain capture
        // stream (no loopback flag).
        client
            .initialize_client(&format, &Direction::Capture, &mode)
            .map_err(|e| CaptureError::Init(e.to_string()))?;
        let event = client
            .set_get_eventhandle()
            .map_err(|e| CaptureError::Init(e.to_string()))?;
        let capture = client
            .get_audiocaptureclient()
            .map_err(|e| CaptureError::Init(e.to_string()))?;
        client
            .start_stream()
            .map_err(|e| CaptureError::Init(e.to_string()))?;

        Ok(Inner {
            client,
            capture,
            event,
            queue: VecDeque::new(),
            blockalign: format.get_blockalign() as usize,
            channels: self.channels as usize,
        })
    }
}

impl AudioSource for WasapiPcmSource {
    fn format(&self) -> AudioFormat {
        AudioFormat {
            sample_rate: self.sample_rate,
        }
    }

    fn read(&mut self, out: &mut Vec<f32>) -> Result<usize, CaptureError> {
        if self.inner.is_none() {
            self.inner = Some(self.init_inner()?);
        }
        // Just set above; taking a mutable reference cannot fail here.
        let inner = match self.inner.as_mut() {
            Some(inner) => inner,
            None => return Ok(0),
        };
        if inner.blockalign == 0 {
            return Err(CaptureError::Backend("zero block alignment".into()));
        }

        // Wait (bounded) for the next buffer; a timeout is a normal quiet cycle.
        if inner.event.wait_for_event(EVENT_TIMEOUT_MS).is_err() {
            return Ok(0);
        }
        inner
            .capture
            .read_from_device_to_deque(&mut inner.queue)
            .map_err(|e| CaptureError::Backend(e.to_string()))?;

        let frames = inner.queue.len() / inner.blockalign;
        if frames == 0 {
            return Ok(0);
        }
        let bytes = frames * inner.blockalign;
        let raw: Vec<u8> = inner.queue.drain(..bytes).collect();
        let channels = inner.channels.max(1);
        let mut count = 0usize;
        for frame in raw.chunks_exact(inner.blockalign) {
            let mut acc = 0.0f32;
            for ch in 0..channels {
                let o = ch * 4;
                acc += f32::from_le_bytes([frame[o], frame[o + 1], frame[o + 2], frame[o + 3]]);
            }
            out.push(acc / channels as f32);
            count += 1;
        }
        Ok(count)
    }
}

impl Drop for Inner {
    fn drop(&mut self) {
        // Best-effort: stop the capture stream so the endpoint is released.
        let _ = self.client.stop_stream();
    }
}

/// f32 loopback capture from the default render endpoint (system audio).
pub struct WindowsLoopbackSource(WasapiPcmSource);

impl WindowsLoopbackSource {
    pub fn new() -> Result<Self, CaptureError> {
        Ok(Self(WasapiPcmSource::new(WindowsEndpoint::RenderLoopback)?))
    }
}

impl AudioSource for WindowsLoopbackSource {
    fn format(&self) -> AudioFormat {
        self.0.format()
    }

    fn read(&mut self, out: &mut Vec<f32>) -> Result<usize, CaptureError> {
        self.0.read(out)
    }
}

/// f32 capture from the default capture endpoint (microphone).
pub struct WindowsMicrophoneSource(WasapiPcmSource);

impl WindowsMicrophoneSource {
    pub fn new() -> Result<Self, CaptureError> {
        Ok(Self(WasapiPcmSource::new(WindowsEndpoint::Capture)?))
    }
}

impl AudioSource for WindowsMicrophoneSource {
    fn format(&self) -> AudioFormat {
        self.0.format()
    }

    fn read(&mut self, out: &mut Vec<f32>) -> Result<usize, CaptureError> {
        self.0.read(out)
    }
}
