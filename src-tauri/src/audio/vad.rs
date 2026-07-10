//! Voice-activity detection (VAD) gating speech vs silence (AC-01.9).
//!
//! Energy-based detector with hysteresis: a short-time RMS is compared against a
//! threshold, an onset requires a few consecutive speech frames (rejects clicks)
//! and a hangover keeps the "active" state through brief intra-word gaps so a
//! single utterance is not shredded into many chunks. Pure and deterministic -
//! no I/O, no clock - so it is fully unit-testable on synthetic PCM.
//!
//! The [`Vad::active`] flag is the sole gate the chunker uses: while it is
//! false, the chunker accumulates nothing, so pure silence produces NO chunk and
//! therefore NO downstream STT/LLM call (AC-01.9).

/// Tuning for [`Vad`]. Frame size is expressed in samples so the detector is
/// sample-rate agnostic; the pipeline derives it from the source format.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct VadConfig {
    /// Samples per analysis frame (e.g. 30 ms at the source rate).
    pub frame_samples: usize,
    /// RMS above this counts the frame as speech. Samples are `[-1.0, 1.0]`.
    pub energy_threshold: f32,
    /// Consecutive speech frames required to switch from silence to active.
    pub onset_frames: u32,
    /// Consecutive silence frames tolerated before active drops to silence
    /// (the hangover tail that bridges intra-word gaps).
    pub hangover_frames: u32,
}

impl Default for VadConfig {
    fn default() -> Self {
        // 30 ms frames at 48 kHz = 1440 samples; ~60 ms onset, ~300 ms hangover.
        Self {
            frame_samples: 1_440,
            energy_threshold: 0.012,
            onset_frames: 2,
            hangover_frames: 10,
        }
    }
}

/// Root-mean-square energy of a frame. `0.0` for an empty frame.
#[must_use]
pub fn frame_rms(frame: &[f32]) -> f32 {
    if frame.is_empty() {
        return 0.0;
    }
    let sum_sq: f64 = frame.iter().map(|&s| (s as f64) * (s as f64)).sum();
    (sum_sq / frame.len() as f64).sqrt() as f32
}

/// Stateful energy VAD with onset/hangover hysteresis. Feed it fixed-size
/// frames in order; [`Vad::active`] reports whether speech is currently in
/// progress (including the hangover tail).
#[derive(Debug, Clone)]
pub struct Vad {
    config: VadConfig,
    active: bool,
    speech_run: u32,
    silence_run: u32,
}

impl Vad {
    /// Builds a VAD from `config`, starting in the silence state.
    #[must_use]
    pub fn new(config: VadConfig) -> Self {
        Self {
            config,
            active: false,
            speech_run: 0,
            silence_run: 0,
        }
    }

    /// Whether speech is currently active (post-onset, pre-hangover-expiry).
    #[must_use]
    pub fn active(&self) -> bool {
        self.active
    }

    /// Feeds one frame and returns the updated active state.
    ///
    /// Onset: after `onset_frames` consecutive speech frames, active becomes
    /// true. Hangover: once active, it stays true until `hangover_frames`
    /// consecutive silence frames are seen, then drops to false.
    pub fn update(&mut self, frame: &[f32]) -> bool {
        let is_speech = frame_rms(frame) >= self.config.energy_threshold;
        if is_speech {
            self.speech_run = self.speech_run.saturating_add(1);
            self.silence_run = 0;
        } else {
            self.silence_run = self.silence_run.saturating_add(1);
            self.speech_run = 0;
        }

        if self.active {
            if self.silence_run >= self.config.hangover_frames {
                self.active = false;
            }
        } else if self.speech_run >= self.config.onset_frames {
            self.active = true;
        }
        self.active
    }

    /// Resets to the initial silence state (reused across sessions).
    pub fn reset(&mut self) {
        self.active = false;
        self.speech_run = 0;
        self.silence_run = 0;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const FRAME: usize = 480; // 30 ms at 16 kHz

    fn cfg() -> VadConfig {
        VadConfig {
            frame_samples: FRAME,
            energy_threshold: 0.05,
            onset_frames: 2,
            hangover_frames: 3,
        }
    }

    /// A constant-amplitude "tone" frame; RMS == amplitude. Synthetic only.
    fn tone(amp: f32) -> Vec<f32> {
        vec![amp; FRAME]
    }

    fn silence() -> Vec<f32> {
        vec![0.0; FRAME]
    }

    #[test]
    fn rms_of_silence_is_zero_and_of_tone_is_amplitude() {
        assert_eq!(frame_rms(&silence()), 0.0);
        assert!((frame_rms(&tone(0.2)) - 0.2).abs() < 1e-6);
    }

    #[test]
    fn pure_silence_never_activates() {
        let mut vad = Vad::new(cfg());
        for _ in 0..50 {
            assert!(!vad.update(&silence()));
        }
        assert!(!vad.active());
    }

    #[test]
    fn sub_threshold_noise_is_treated_as_silence() {
        let mut vad = Vad::new(cfg());
        // Below the 0.05 threshold: quiet room tone must not trip the VAD.
        for _ in 0..20 {
            assert!(!vad.update(&tone(0.01)));
        }
    }

    #[test]
    fn onset_requires_consecutive_speech_frames() {
        let mut vad = Vad::new(cfg());
        // One loud frame alone (onset_frames = 2) must not activate.
        assert!(!vad.update(&tone(0.3)));
        // Second consecutive loud frame crosses the onset.
        assert!(vad.update(&tone(0.3)));
    }

    #[test]
    fn hangover_bridges_short_gaps_but_closes_after_it_expires() {
        let mut vad = Vad::new(cfg());
        vad.update(&tone(0.3));
        assert!(vad.update(&tone(0.3)));
        // A 2-frame gap (< hangover of 3) stays active.
        assert!(vad.update(&silence()));
        assert!(vad.update(&silence()));
        // The 3rd consecutive silent frame expires the hangover.
        assert!(!vad.update(&silence()));
    }
}
