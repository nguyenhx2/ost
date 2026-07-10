//! Speech chunking: turns a raw mono sample stream into speech-only
//! [`AudioChunk`]s sized for the STT budget (AC-01.9, AC-05.3).
//!
//! [`SpeechChunker`] slices the incoming stream into fixed VAD frames, gates
//! them through [`Vad`], and accumulates only the active (speech) frames into
//! the in-progress chunk. It emits a chunk when speech ends (VAD hangover
//! expires) or when the chunk hits its maximum length, so downstream STT sees
//! bounded, speech-bearing audio and never a silence-only chunk. A small
//! pre-roll re-attaches the frames consumed by VAD onset so leading phonemes are
//! not clipped.
//!
//! Pure and I/O-free: it operates on borrowed slices and hands finished chunks
//! back through a caller-supplied callback - the seam the capture session wires
//! to its output channel, and the reason chunking is fully unit-testable without
//! audio hardware or the filesystem.

use std::collections::VecDeque;

use crate::audio::source::AudioChunk;
use crate::audio::vad::{Vad, VadConfig};

/// Tuning for [`SpeechChunker`]. Lengths are in samples so the chunker is
/// sample-rate agnostic; the pipeline derives them from the source format and
/// the STT latency budget (audio caption end-to-end p95 < 3s).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct ChunkConfig {
    /// VAD tuning; `vad.frame_samples` also sets the analysis frame size.
    pub vad: VadConfig,
    /// Sample rate stamped on emitted chunks.
    pub sample_rate: u32,
    /// Chunks shorter than this (in samples) at close time are dropped as
    /// spurious blips - keeps a single click that trips onset from becoming a
    /// caption.
    pub min_chunk_samples: usize,
    /// Hard cap: an ongoing utterance is force-split here so latency stays
    /// bounded (a long monologue still streams captions).
    pub max_chunk_samples: usize,
}

impl ChunkConfig {
    /// Default tuning for a `sample_rate` stream: 30 ms VAD frames, drop chunks
    /// under ~250 ms, force-split at ~2 s (keeps end-to-end latency in budget).
    #[must_use]
    pub fn for_rate(sample_rate: u32) -> Self {
        let frame_samples = ((sample_rate as u64 * 30) / 1000) as usize;
        Self {
            vad: VadConfig {
                frame_samples,
                ..VadConfig::default()
            },
            sample_rate,
            min_chunk_samples: ((sample_rate as u64 * 250) / 1000) as usize,
            max_chunk_samples: ((sample_rate as u64 * 2_000) / 1000) as usize,
        }
    }
}

/// Stateful speech chunker. Feed it sample blocks of any length via
/// [`SpeechChunker::push`]; finished chunks arrive through the callback.
pub struct SpeechChunker {
    config: ChunkConfig,
    vad: Vad,
    /// Samples not yet forming a whole VAD frame.
    residual: Vec<f32>,
    /// Accumulated samples of the in-progress speech chunk.
    current: Vec<f32>,
    /// Rolling last-N frames captured during silence, re-attached on onset so
    /// the leading frames VAD spent detecting speech are not clipped.
    preroll: VecDeque<f32>,
    /// Cap on `preroll` length in samples (`onset_frames` worth).
    preroll_cap: usize,
    /// Monotonic per-session chunk index.
    sequence: u64,
    /// Whether VAD was active on the previous frame.
    was_active: bool,
}

impl SpeechChunker {
    /// Builds a chunker from `config`, starting in the silence state.
    #[must_use]
    pub fn new(config: ChunkConfig) -> Self {
        let preroll_cap = config.vad.frame_samples * config.vad.onset_frames as usize;
        Self {
            vad: Vad::new(config.vad),
            config,
            residual: Vec::new(),
            current: Vec::new(),
            preroll: VecDeque::new(),
            preroll_cap,
            sequence: 0,
            was_active: false,
        }
    }

    /// Feeds `samples` (mono `f32`) and invokes `emit` once per completed chunk.
    pub fn push<F: FnMut(AudioChunk)>(&mut self, samples: &[f32], mut emit: F) {
        self.residual.extend_from_slice(samples);
        let frame = self.config.vad.frame_samples;
        if frame == 0 {
            return;
        }
        let mut start = 0;
        while start + frame <= self.residual.len() {
            let end = start + frame;
            let active = {
                let slice = &self.residual[start..end];
                self.vad.update(slice)
            };
            if active {
                if !self.was_active {
                    // Onset: re-attach the pre-roll captured during silence.
                    self.current.extend(self.preroll.drain(..));
                }
                self.current.extend_from_slice(&self.residual[start..end]);
                if self.current.len() >= self.config.max_chunk_samples {
                    self.emit_current(&mut emit);
                }
            } else {
                if self.was_active {
                    // Speech just ended (hangover expired): close the chunk.
                    self.emit_current(&mut emit);
                }
                self.push_preroll(start, end);
            }
            self.was_active = active;
            start = end;
        }
        // Retain the unconsumed tail as the next residual.
        self.residual.drain(0..start);
    }

    /// Flushes any in-progress speech chunk (call on session stop so the last
    /// utterance is not lost). No-op if nothing speech-bearing is buffered.
    pub fn flush<F: FnMut(AudioChunk)>(&mut self, mut emit: F) {
        self.emit_current(&mut emit);
        self.residual.clear();
    }

    fn push_preroll(&mut self, start: usize, end: usize) {
        if self.preroll_cap == 0 {
            return;
        }
        self.preroll
            .extend(self.residual[start..end].iter().copied());
        while self.preroll.len() > self.preroll_cap {
            self.preroll.pop_front();
        }
    }

    fn emit_current<F: FnMut(AudioChunk)>(&mut self, emit: &mut F) {
        if self.current.len() >= self.config.min_chunk_samples {
            let samples = std::mem::take(&mut self.current);
            let chunk = AudioChunk {
                samples,
                sample_rate: self.config.sample_rate,
                sequence: self.sequence,
            };
            self.sequence += 1;
            emit(chunk);
        } else {
            // Too short to be speech - drop it, emit nothing (AC-01.9).
            self.current.clear();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // 1 kHz stream, 100-sample (100 ms) frames for easy arithmetic.
    fn cfg() -> ChunkConfig {
        ChunkConfig {
            vad: VadConfig {
                frame_samples: 100,
                energy_threshold: 0.05,
                onset_frames: 2,
                hangover_frames: 3,
            },
            sample_rate: 1_000,
            min_chunk_samples: 200,
            max_chunk_samples: 2_000,
        }
    }

    fn speech(frames: usize) -> Vec<f32> {
        vec![0.3; frames * 100]
    }

    fn silence(frames: usize) -> Vec<f32> {
        vec![0.0; frames * 100]
    }

    fn collect(chunker: &mut SpeechChunker, samples: &[f32], out: &mut Vec<AudioChunk>) {
        chunker.push(samples, |c| out.push(c));
    }

    #[test]
    fn pure_silence_emits_no_chunk() {
        let mut chunker = SpeechChunker::new(cfg());
        let mut out = Vec::new();
        collect(&mut chunker, &silence(50), &mut out);
        chunker.flush(|c| out.push(c));
        assert!(out.is_empty(), "silence must never produce a chunk");
    }

    #[test]
    fn one_speech_burst_yields_one_chunk() {
        let mut chunker = SpeechChunker::new(cfg());
        let mut out = Vec::new();
        // 8 speech frames, then >= hangover silence to close the chunk.
        let mut stream = speech(8);
        stream.extend(silence(4));
        collect(&mut chunker, &stream, &mut out);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].sequence, 0);
        assert_eq!(out[0].sample_rate, 1_000);
        // Chunk carries the speech plus the short hangover tail, in-memory only.
        assert!(out[0].samples.len() >= 800);
    }

    #[test]
    fn long_speech_is_split_at_the_max_chunk_length() {
        let mut chunker = SpeechChunker::new(cfg());
        let mut out = Vec::new();
        // 50 frames (5000 samples) of continuous speech, then closing silence.
        let mut stream = speech(50);
        stream.extend(silence(4));
        collect(&mut chunker, &stream, &mut out);
        assert!(out.len() >= 2, "continuous speech must split into chunks");
        for chunk in &out {
            assert!(
                chunk.samples.len() <= cfg().max_chunk_samples,
                "no chunk may exceed the max length"
            );
        }
        // Sequence numbers are monotonic from 0.
        for (i, chunk) in out.iter().enumerate() {
            assert_eq!(chunk.sequence, i as u64);
        }
    }

    #[test]
    fn sub_min_blip_is_dropped() {
        let mut cfg = cfg();
        cfg.min_chunk_samples = 1_000;
        let mut chunker = SpeechChunker::new(cfg);
        let mut out = Vec::new();
        // Just enough speech to trip onset, then silence: total < min length.
        let mut stream = speech(2);
        stream.extend(silence(5));
        collect(&mut chunker, &stream, &mut out);
        chunker.flush(|c| out.push(c));
        assert!(out.is_empty(), "a blip under min length must be dropped");
    }

    #[test]
    fn flush_emits_in_progress_speech() {
        let mut chunker = SpeechChunker::new(cfg());
        let mut out = Vec::new();
        // Ongoing speech with no closing silence; only flush should release it.
        collect(&mut chunker, &speech(6), &mut out);
        assert!(out.is_empty(), "chunk stays open without closing silence");
        chunker.flush(|c| out.push(c));
        assert_eq!(out.len(), 1);
        assert!(out[0].samples.len() >= 400);
    }

    #[test]
    fn arbitrary_block_sizes_are_reassembled() {
        // Feed the same speech burst one sample at a time; framing must still
        // work identically (residual buffering across push calls).
        let mut chunker = SpeechChunker::new(cfg());
        let mut out = Vec::new();
        let mut stream = speech(8);
        stream.extend(silence(4));
        for s in &stream {
            chunker.push(std::slice::from_ref(s), |c| out.push(c));
        }
        assert_eq!(out.len(), 1);
    }
}
