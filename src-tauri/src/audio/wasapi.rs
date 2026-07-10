//! Windows WASAPI loopback backend for [`AudioSource`] (FR-01, first impl).
//!
//! Captures whatever is playing to the default render endpoint (system audio)
//! by opening that render device in loopback capture mode. This is the ONLY
//! platform impl today; macOS ScreenCaptureKit and Linux PipeWire are Phase-4
//! swaps behind the same trait (NFR-SCA-01), not call-site changes.
//!
//! Threading: the COM/WASAPI client is created lazily on the FIRST `read`, which
//! the session runs on its dedicated capture thread, so all interface use stays
//! on one MTA thread. [`WindowsLoopbackSource::new`] does a cheap probe (default
//! render endpoint mix format) only to report [`AudioFormat`] before the thread
//! starts, then drops those objects.
//!
//! HARD SECURITY REQUIREMENT (AC-01.6 / BR-01): captured frames are converted to
//! in-memory mono `f32` and handed straight to the pipeline. Nothing here writes
//! audio to disk or a network payload.

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

/// f32 loopback capture from the default render endpoint.
pub struct WindowsLoopbackSource {
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
// concurrently. `WindowsLoopbackSource` is moved to the capture thread while
// `inner` is still `None`, so no COM pointer actually crosses a thread
// boundary. COM is initialized MTA on that thread before any interface use.
unsafe impl Send for WindowsLoopbackSource {}

impl WindowsLoopbackSource {
    /// Probes the default render endpoint to learn its mix format, so
    /// [`AudioSource::format`] is answerable before capture starts. The heavy
    /// client is built later, on the capture thread.
    pub fn new() -> Result<Self, CaptureError> {
        initialize_mta()
            .ok()
            .map_err(|e| CaptureError::Init(e.to_string()))?;
        let enumerator = DeviceEnumerator::new().map_err(|e| CaptureError::Init(e.to_string()))?;
        let device = enumerator
            .get_default_device(&Direction::Render)
            .map_err(|_| CaptureError::NoEndpoint)?;
        let client = device
            .get_iaudioclient()
            .map_err(|e| CaptureError::Init(e.to_string()))?;
        let mix = client
            .get_mixformat()
            .map_err(|e| CaptureError::Init(e.to_string()))?;
        Ok(Self {
            sample_rate: mix.get_samplespersec(),
            channels: mix.get_nchannels(),
            inner: None,
        })
    }

    /// Builds the live loopback client on the current (capture) thread.
    fn init_inner(&self) -> Result<Inner, CaptureError> {
        // Ensure this thread shares the process MTA before touching COM.
        initialize_mta()
            .ok()
            .map_err(|e| CaptureError::Init(e.to_string()))?;
        let enumerator = DeviceEnumerator::new().map_err(|e| CaptureError::Init(e.to_string()))?;
        let device = enumerator
            .get_default_device(&Direction::Render)
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
        // Render device + Capture direction = loopback (the wasapi crate sets
        // AUDCLNT_STREAMFLAGS_LOOPBACK for this combination).
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

impl AudioSource for WindowsLoopbackSource {
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
