//! System-audio capture pipeline (WASAPI loopback + microphone), VAD and
//! chunking (FR-01).
//!
//! Layout mirrors the OCR/capture pipelines: a platform-agnostic trait
//! ([`AudioSource`]) with Windows-first impls, plus pure, unit-testable stages
//! (VAD, chunking) wired together by a session that runs OFF the UI thread
//! (AC-05.3) and streams speech chunks to the STT stage (TASK-014).
//!
//! [`open_source`] is the single seam Platform Shell uses to start a session:
//! it picks a source by [`AudioSourceKind`] without ever naming a concrete
//! backend type, so Phase-4 macOS/Linux ports are a swap behind this function,
//! not a call-site change (NFR-SCA-01).
//!
//! Privacy invariant (AC-01.6 / BR-01): every stage keeps audio in memory only;
//! nothing writes raw audio to disk or into a network payload. Only the
//! transcribed TEXT produced downstream ever leaves this process.

pub mod chunk;
pub mod session;
pub mod source;
pub mod vad;

#[cfg(windows)]
pub mod wasapi;

pub use chunk::{ChunkConfig, SpeechChunker};
pub use session::CaptureSession;
pub use source::{downmix_to_mono, AudioChunk, AudioFormat, AudioSource, CaptureError};
pub use vad::{frame_rms, Vad, VadConfig};

#[cfg(windows)]
pub use wasapi::{WindowsLoopbackSource, WindowsMicrophoneSource};

/// Which endpoint a live audio session captures from (FR-01).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum AudioSourceKind {
    /// System playback captured via WASAPI loopback - the default.
    #[default]
    SystemLoopback,
    /// The default capture (microphone) endpoint.
    Microphone,
}

impl AudioSourceKind {
    /// The wire string this kind serializes to (`serde` camelCase), exposed
    /// for callers that need it without going through a serializer.
    #[must_use]
    pub fn as_str(&self) -> &'static str {
        match self {
            AudioSourceKind::SystemLoopback => "systemLoopback",
            AudioSourceKind::Microphone => "microphone",
        }
    }
}

/// Error returned when parsing an [`AudioSourceKind`] from an unrecognized
/// wire string.
#[derive(Debug, thiserror::Error)]
#[error("unknown audio source kind: {0}")]
pub struct ParseAudioSourceKindError(String);

impl std::str::FromStr for AudioSourceKind {
    type Err = ParseAudioSourceKindError;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "systemLoopback" => Ok(AudioSourceKind::SystemLoopback),
            "microphone" => Ok(AudioSourceKind::Microphone),
            other => Err(ParseAudioSourceKindError(other.to_string())),
        }
    }
}

/// Opens the platform backend for `kind`. The single seam Platform Shell uses
/// to start capture; it never names a concrete backend type.
#[cfg(windows)]
pub fn open_source(kind: AudioSourceKind) -> Result<Box<dyn AudioSource>, CaptureError> {
    match kind {
        AudioSourceKind::SystemLoopback => {
            Ok(Box::new(WindowsLoopbackSource::new()?) as Box<dyn AudioSource>)
        }
        AudioSourceKind::Microphone => {
            Ok(Box::new(WindowsMicrophoneSource::new()?) as Box<dyn AudioSource>)
        }
    }
}

/// Opens the platform backend for `kind`. Phase-4 ports (macOS/Linux) land
/// behind this same seam; today, non-Windows has no capture backend.
#[cfg(not(windows))]
pub fn open_source(_kind: AudioSourceKind) -> Result<Box<dyn AudioSource>, CaptureError> {
    Err(CaptureError::NoEndpoint)
}

#[cfg(test)]
mod contract_tests {
    //! Contract test for [`AudioSource`] (testing.md "Context-boundary
    //! tests"): exercises the trait's documented behaviour - format,
    //! bounded/silent reads, mono output - through a fake standing in for
    //! EACH [`AudioSourceKind`], proving the contract is sufficient for a
    //! caller that only knows the trait, not a concrete backend. Never real
    //! captured audio (agent-guardrails.md section 4).
    use super::*;
    use std::time::Duration;

    /// A fake backend that stands in for a platform endpoint of a given
    /// [`AudioSourceKind`] (the kind is only relevant to the caller wiring the
    /// test, not to the fake's behaviour): it replays a scripted mono block
    /// once, then yields `Ok(0)` (silence) forever after, with a bounded
    /// synthetic delay - mirroring the documented "bounded read, Ok(0) on
    /// silence" contract every real WASAPI-backed [`AudioSource`] must uphold.
    struct FakeEndpoint {
        sample_rate: u32,
        block: Option<Vec<f32>>,
    }

    impl FakeEndpoint {
        fn new(sample_rate: u32, block: Vec<f32>) -> Self {
            Self {
                sample_rate,
                block: Some(block),
            }
        }
    }

    impl AudioSource for FakeEndpoint {
        fn format(&self) -> AudioFormat {
            AudioFormat {
                sample_rate: self.sample_rate,
            }
        }

        fn read(&mut self, out: &mut Vec<f32>) -> Result<usize, CaptureError> {
            // Bounded even while "silent": never blocks unboundedly, exactly
            // like the WASAPI event-timeout contract every backend documents.
            std::thread::sleep(Duration::from_millis(1));
            match self.block.take() {
                Some(block) => {
                    let n = block.len();
                    out.extend(block);
                    Ok(n)
                }
                None => Ok(0),
            }
        }
    }

    /// Runs the shared assertions against any [`AudioSource`], regardless of
    /// which [`AudioSourceKind`] backs it - the point of a contract test.
    fn assert_contract(mut source: impl AudioSource, kind: AudioSourceKind) {
        let format = source.format();
        assert!(format.sample_rate > 0, "{kind:?}: sample rate must be set");

        let mut out = Vec::new();
        let n = source
            .read(&mut out)
            .unwrap_or_else(|e| panic!("{kind:?}: first read must not fail: {e}"));
        assert_eq!(
            n,
            out.len(),
            "{kind:?}: returned count matches appended samples"
        );
        assert!(!out.is_empty(), "{kind:?}: scripted block must surface");

        // Exhausted -> silent cycle: Ok(0), never an error, never a block.
        let before = out.len();
        let n2 = source
            .read(&mut out)
            .unwrap_or_else(|e| panic!("{kind:?}: silent read must not fail: {e}"));
        assert_eq!(n2, 0, "{kind:?}: silence yields Ok(0)");
        assert_eq!(out.len(), before, "{kind:?}: Ok(0) appends nothing");
    }

    #[test]
    fn system_loopback_source_upholds_the_contract() {
        let kind = AudioSourceKind::SystemLoopback;
        let source = FakeEndpoint::new(48_000, vec![0.1, -0.2, 0.3]);
        assert_contract(source, kind);
    }

    #[test]
    fn microphone_source_upholds_the_contract() {
        let kind = AudioSourceKind::Microphone;
        let source = FakeEndpoint::new(16_000, vec![0.05, 0.0, -0.05]);
        assert_contract(source, kind);
    }

    #[test]
    fn kind_round_trips_through_its_wire_string() {
        for kind in [AudioSourceKind::SystemLoopback, AudioSourceKind::Microphone] {
            let parsed: AudioSourceKind = kind.as_str().parse().expect("wire string parses back");
            assert_eq!(parsed, kind);
        }
    }

    #[test]
    fn kind_defaults_to_system_loopback() {
        assert_eq!(AudioSourceKind::default(), AudioSourceKind::SystemLoopback);
    }

    #[test]
    fn kind_serializes_to_camel_case_wire_format() {
        let loopback = serde_json::to_string(&AudioSourceKind::SystemLoopback).unwrap();
        let mic = serde_json::to_string(&AudioSourceKind::Microphone).unwrap();
        assert_eq!(loopback, "\"systemLoopback\"");
        assert_eq!(mic, "\"microphone\"");
    }
}
