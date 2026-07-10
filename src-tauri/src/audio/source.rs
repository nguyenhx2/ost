//! The [`AudioSource`] trait and its data types (FR-01, NFR-SCA-01).
//!
//! This is the single surface the capture -> VAD -> chunk pipeline pulls audio
//! from. Platform-specific backends (Windows WASAPI loopback first; macOS
//! ScreenCaptureKit / Linux PipeWire in Phase 4) live behind this trait so the
//! ports swap impls, not call sites.
//!
//! HARD SECURITY REQUIREMENT (AC-01.6 / BR-01): captured audio lives ONLY in
//! in-memory `f32` buffers. Nothing in this module - or anything downstream of
//! it - writes raw audio to disk or puts it in a network payload; only the
//! transcribed TEXT (produced later by the STT stage) ever leaves this process.

use std::time::Duration;

/// Describes the PCM stream a source produces. Samples handed to the pipeline
/// are always mono `f32` in `[-1.0, 1.0]`; a backend that captures interleaved
/// stereo downmixes to mono before yielding.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct AudioFormat {
    /// Samples per second of the mono stream (e.g. 48000 for WASAPI loopback).
    pub sample_rate: u32,
}

impl AudioFormat {
    /// Number of samples that span `ms` milliseconds at this rate.
    #[must_use]
    pub fn samples_for_ms(&self, ms: u32) -> usize {
        ((self.sample_rate as u64 * ms as u64) / 1000) as usize
    }
}

/// One speech chunk emitted downstream to the STT stage (TASK-014).
///
/// Owns its mono `f32` samples; the pipeline never retains a reference to the
/// source buffer. Samples stay in RAM for the active session only (BR-01).
#[derive(Debug, Clone, PartialEq)]
pub struct AudioChunk {
    /// Mono PCM samples in `[-1.0, 1.0]`, in-memory only - never persisted.
    pub samples: Vec<f32>,
    /// Sample rate of `samples`; the STT stage resamples to whisper's 16 kHz.
    pub sample_rate: u32,
    /// Monotonic per-session index, starting at 0. Lets the consumer order
    /// captions without timestamps leaking capture wall-clock time.
    pub sequence: u64,
}

impl AudioChunk {
    /// Wall-clock duration of the chunk from its sample count and rate.
    #[must_use]
    pub fn duration(&self) -> Duration {
        if self.sample_rate == 0 {
            return Duration::ZERO;
        }
        Duration::from_secs_f64(self.samples.len() as f64 / self.sample_rate as f64)
    }
}

/// Errors surfaced by an [`AudioSource`]. Display strings never carry audio
/// samples or any captured content.
#[derive(Debug, thiserror::Error)]
pub enum CaptureError {
    /// No capturable audio endpoint was reported by the platform backend.
    #[error("no capturable audio endpoint found")]
    NoEndpoint,
    /// The backend could not initialize the capture client (device init,
    /// format negotiation, or COM/WASAPI activation failure).
    #[error("audio capture init failed: {0}")]
    Init(String),
    /// A read from the platform capture backend failed mid-session.
    #[error("audio capture backend error: {0}")]
    Backend(String),
}

/// One system-audio capture backend.
///
/// The pipeline pulls audio by calling [`AudioSource::read`] in a loop on a
/// dedicated thread (AC-05.3) - never on the UI thread. `read` MUST return
/// within a bounded interval (at most a few hundred milliseconds) even when no
/// audio is playing, so the session's stop signal is observed promptly and
/// capture halts within <= 1s (AC-01.10).
pub trait AudioSource: Send {
    /// The format of the mono stream this source yields.
    fn format(&self) -> AudioFormat;

    /// Appends the next block of mono `f32` samples to `out` and returns how
    /// many were appended.
    ///
    /// Returns `Ok(0)` when no audio is available this cycle (e.g. silence on
    /// the loopback endpoint or a poll timeout); the caller keeps looping and
    /// re-checks the stop flag. Blocking backends (WASAPI) MUST cap that block
    /// so `read` still returns within the bounded interval documented above.
    fn read(&mut self, out: &mut Vec<f32>) -> Result<usize, CaptureError>;
}

/// Interleaved-to-mono downmix by averaging channels. Pure and allocation-light
/// (writes into `out`); the shared seam every multi-channel backend uses and a
/// unit-testable helper. `channels` of 0 or 1 copies straight through.
pub fn downmix_to_mono(interleaved: &[f32], channels: u16, out: &mut Vec<f32>) {
    let ch = channels.max(1) as usize;
    if ch == 1 {
        out.extend_from_slice(interleaved);
        return;
    }
    let frames = interleaved.len() / ch;
    out.reserve(frames);
    for f in 0..frames {
        let base = f * ch;
        let mut acc = 0.0f32;
        for c in 0..ch {
            acc += interleaved[base + c];
        }
        out.push(acc / ch as f32);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn samples_for_ms_scales_with_rate() {
        let fmt = AudioFormat {
            sample_rate: 48_000,
        };
        assert_eq!(fmt.samples_for_ms(30), 1_440);
        assert_eq!(fmt.samples_for_ms(1_000), 48_000);
    }

    #[test]
    fn chunk_duration_matches_sample_count() {
        let chunk = AudioChunk {
            samples: vec![0.0; 16_000],
            sample_rate: 16_000,
            sequence: 0,
        };
        assert_eq!(chunk.duration(), Duration::from_secs(1));
    }

    #[test]
    fn downmix_stereo_averages_channels() {
        // L=1.0 R=0.0 -> 0.5, per frame.
        let interleaved = [1.0, 0.0, 1.0, 0.0];
        let mut out = Vec::new();
        downmix_to_mono(&interleaved, 2, &mut out);
        assert_eq!(out, vec![0.5, 0.5]);
    }

    #[test]
    fn downmix_mono_passes_through() {
        let mono = [0.1, -0.2, 0.3];
        let mut out = Vec::new();
        downmix_to_mono(&mono, 1, &mut out);
        assert_eq!(out, vec![0.1, -0.2, 0.3]);
    }
}
