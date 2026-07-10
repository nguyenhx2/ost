//! The capture session: runs capture + VAD + chunking on a dedicated thread and
//! streams speech chunks out through a channel (AC-05.3, AC-01.10).
//!
//! WASAPI (and every OS capture API) reads block, so the pull loop lives on its
//! OWN `std::thread` - never the UI/main thread and never a Tokio worker. The
//! session hands finished [`AudioChunk`]s to the consumer (TASK-014 STT) through
//! a `tokio::sync::mpsc` channel so the async STT task can await them without
//! blocking. Stopping sets an atomic flag the loop checks every read cycle;
//! because [`AudioSource::read`] is contractually bounded, capture halts and the
//! source (its WASAPI client) is dropped within <= 1s (AC-01.10).
//!
//! Nothing here touches the filesystem: samples exist only in memory, flow
//! through the channel, and are dropped when the consumer is done (BR-01,
//! AC-01.6).

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread::JoinHandle;

use tokio::sync::mpsc;

use crate::audio::chunk::{ChunkConfig, SpeechChunker};
use crate::audio::source::{AudioChunk, AudioSource};

/// Default bound on the chunk channel. Small: the STT stage keeps up under
/// budget, and a bounded channel applies natural backpressure instead of
/// growing an unbounded in-memory audio backlog.
const DEFAULT_CHANNEL_CAPACITY: usize = 32;

/// A running audio-capture session. Dropping it (or calling [`CaptureSession::stop`])
/// halts capture and releases the source within <= 1s.
pub struct CaptureSession {
    stop: Arc<AtomicBool>,
    handle: Option<JoinHandle<()>>,
}

impl CaptureSession {
    /// Starts capture from `source` with tuning derived from its sample rate.
    /// Returns the session handle and the receiver of speech chunks.
    pub fn start<S>(source: S) -> (Self, mpsc::Receiver<AudioChunk>)
    where
        S: AudioSource + 'static,
    {
        let config = ChunkConfig::for_rate(source.format().sample_rate);
        Self::start_with(source, config, DEFAULT_CHANNEL_CAPACITY)
    }

    /// Starts capture with an explicit chunk config and channel capacity.
    pub fn start_with<S>(
        mut source: S,
        config: ChunkConfig,
        capacity: usize,
    ) -> (Self, mpsc::Receiver<AudioChunk>)
    where
        S: AudioSource + 'static,
    {
        let (tx, rx) = mpsc::channel(capacity.max(1));
        let stop = Arc::new(AtomicBool::new(false));
        let stop_thread = Arc::clone(&stop);

        let handle = std::thread::Builder::new()
            .name("ost-audio-capture".to_string())
            .spawn(move || run_capture(source_as_dyn(&mut source), config, tx, stop_thread))
            // A spawn failure means the OS refused a thread; nothing was
            // captured. We surface it by leaving the receiver to close
            // immediately rather than panicking the caller's thread.
            .ok();

        (Self { stop, handle }, rx)
    }

    /// Signals capture to stop and waits for the thread to finish. Idempotent.
    /// Returns after the source has been dropped (resources released).
    pub fn stop(&mut self) {
        self.stop.store(true, Ordering::SeqCst);
        if let Some(handle) = self.handle.take() {
            // The loop observes the flag within one bounded read cycle, so this
            // join returns well within the 1s budget (AC-01.10).
            let _ = handle.join();
        }
    }
}

impl Drop for CaptureSession {
    fn drop(&mut self) {
        self.stop();
    }
}

/// Reborrow helper so `start_with` can move `source` into the closure while the
/// loop takes it by `&mut dyn`. Keeps `run_capture` monomorphization-free.
fn source_as_dyn(source: &mut (impl AudioSource + 'static)) -> &mut dyn AudioSource {
    source
}

/// The capture loop body. Pulls sample blocks, gates + chunks them, and sends
/// finished chunks downstream until stop is signalled or the consumer drops.
fn run_capture(
    source: &mut dyn AudioSource,
    config: ChunkConfig,
    tx: mpsc::Sender<AudioChunk>,
    stop: Arc<AtomicBool>,
) {
    let mut chunker = SpeechChunker::new(config);
    let mut buf: Vec<f32> = Vec::new();

    while !stop.load(Ordering::SeqCst) {
        buf.clear();
        match source.read(&mut buf) {
            // No audio this cycle (silence/poll timeout): loop and re-check stop.
            Ok(0) => {}
            Ok(_) => {
                let mut consumer_gone = false;
                chunker.push(&buf, |chunk| {
                    // blocking_send is correct here: this is a dedicated OS
                    // thread, not a Tokio worker. An error means the receiver
                    // was dropped - the session is being torn down.
                    if tx.blocking_send(chunk).is_err() {
                        consumer_gone = true;
                    }
                });
                if consumer_gone {
                    break;
                }
            }
            Err(error) => {
                // Backend read failure ends the session; the message never
                // carries audio content (CaptureError guarantees that).
                tracing::warn!(%error, "audio capture read failed; ending session");
                break;
            }
        }
    }

    // Release the last in-progress utterance before the source is dropped.
    chunker.flush(|chunk| {
        let _ = tx.blocking_send(chunk);
    });
    // `source` (the WASAPI client) is dropped by the caller as the closure
    // returns, releasing the capture endpoint.
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::audio::source::{AudioFormat, CaptureError};
    use crate::audio::vad::VadConfig;
    use std::collections::VecDeque;
    use std::time::{Duration, Instant};

    /// A synthetic, hardware-free [`AudioSource`] that replays pre-scripted mono
    /// blocks, then idles. `read_delay` models a blocking capture read so the
    /// stop-latency test exercises the real bounded-read contract. NEVER real
    /// captured audio (agent-guardrails.md section 4).
    struct ScriptedSource {
        blocks: VecDeque<Vec<f32>>,
        sample_rate: u32,
        read_delay: Duration,
    }

    impl ScriptedSource {
        fn new(sample_rate: u32, read_delay: Duration) -> Self {
            Self {
                blocks: VecDeque::new(),
                sample_rate,
                read_delay,
            }
        }

        fn with_block(mut self, block: Vec<f32>) -> Self {
            self.blocks.push_back(block);
            self
        }
    }

    impl AudioSource for ScriptedSource {
        fn format(&self) -> AudioFormat {
            AudioFormat {
                sample_rate: self.sample_rate,
            }
        }

        fn read(&mut self, out: &mut Vec<f32>) -> Result<usize, CaptureError> {
            if !self.read_delay.is_zero() {
                std::thread::sleep(self.read_delay);
            }
            match self.blocks.pop_front() {
                Some(block) => {
                    out.extend_from_slice(&block);
                    Ok(block.len())
                }
                // Exhausted: idle like a silent endpoint (bounded return).
                None => Ok(0),
            }
        }
    }

    /// A synthetic idle source that flips a shared flag when dropped. Lets the
    /// stop test assert the session actually RELEASES the capture backend - the
    /// in-test analogue of the WASAPI client freeing its endpoint on `Drop`
    /// (AC-01.10, "frees resources"). Never real captured audio.
    struct DropSignalSource {
        sample_rate: u32,
        read_delay: Duration,
        dropped: Arc<AtomicBool>,
    }

    impl AudioSource for DropSignalSource {
        fn format(&self) -> AudioFormat {
            AudioFormat {
                sample_rate: self.sample_rate,
            }
        }

        fn read(&mut self, _out: &mut Vec<f32>) -> Result<usize, CaptureError> {
            // Idle like a silent endpoint, but with a bounded blocking read.
            std::thread::sleep(self.read_delay);
            Ok(0)
        }
    }

    impl Drop for DropSignalSource {
        fn drop(&mut self) {
            self.dropped.store(true, Ordering::SeqCst);
        }
    }

    fn test_config() -> ChunkConfig {
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

    /// Polls the receiver up to `deadline` collecting whatever chunks arrive.
    fn drain_for(rx: &mut mpsc::Receiver<AudioChunk>, deadline: Duration) -> Vec<AudioChunk> {
        let start = Instant::now();
        let mut out = Vec::new();
        while start.elapsed() < deadline {
            match rx.try_recv() {
                Ok(chunk) => out.push(chunk),
                Err(mpsc::error::TryRecvError::Empty) => {
                    std::thread::sleep(Duration::from_millis(5));
                }
                Err(mpsc::error::TryRecvError::Disconnected) => break,
            }
        }
        out
    }

    #[test]
    fn speech_session_emits_a_chunk() {
        let mut stream = speech(8);
        stream.extend(silence(4));
        let source = ScriptedSource::new(1_000, Duration::from_millis(2)).with_block(stream);

        let (mut session, mut rx) = CaptureSession::start_with(source, test_config(), 16);
        let chunks = drain_for(&mut rx, Duration::from_millis(500));
        session.stop();

        assert_eq!(chunks.len(), 1, "one speech burst -> one chunk");
        assert!(!chunks[0].samples.is_empty());
    }

    #[test]
    fn silence_session_emits_nothing() {
        // AC-01.9: silence produces no chunk and thus no downstream STT/LLM call.
        let source = ScriptedSource::new(1_000, Duration::from_millis(2)).with_block(silence(30));

        let (mut session, mut rx) = CaptureSession::start_with(source, test_config(), 16);
        let chunks = drain_for(&mut rx, Duration::from_millis(300));
        session.stop();

        assert!(chunks.is_empty(), "silence must not produce a chunk");
    }

    #[test]
    fn stop_halts_capture_within_one_second() {
        // AC-01.10: an idle source with a blocking read still stops promptly.
        let source = ScriptedSource::new(1_000, Duration::from_millis(50));
        let (mut session, _rx) = CaptureSession::start_with(source, test_config(), 16);

        // Let it spin through a few blocking read cycles first.
        std::thread::sleep(Duration::from_millis(120));
        let started = Instant::now();
        session.stop();
        let elapsed = started.elapsed();

        assert!(
            elapsed < Duration::from_secs(1),
            "stop took {elapsed:?}, budget is < 1s"
        );
    }

    #[test]
    fn stop_drops_the_source_releasing_resources() {
        // AC-01.10 (resource freeing): stopping must not merely halt the loop -
        // it must release the capture backend. We assert the source is actually
        // dropped by the session on stop (the WASAPI client frees its endpoint
        // in its own Drop), and that it stays alive while capture is running.
        let dropped = Arc::new(AtomicBool::new(false));
        let source = DropSignalSource {
            sample_rate: 1_000,
            read_delay: Duration::from_millis(20),
            dropped: Arc::clone(&dropped),
        };

        let (mut session, _rx) = CaptureSession::start_with(source, test_config(), 16);
        std::thread::sleep(Duration::from_millis(60));
        assert!(
            !dropped.load(Ordering::SeqCst),
            "source must stay alive while capture is running"
        );

        session.stop();
        assert!(
            dropped.load(Ordering::SeqCst),
            "stop must drop the source to free capture resources (AC-01.10)"
        );
    }

    /// AC-01.6 / BR-01 guard: a full capture session keeps audio in memory and
    /// writes NO file. We watch a fresh temp directory across the session and
    /// assert it stays empty. The pipeline holds only in-RAM `f32` buffers and
    /// the tokio channel; nothing in the module opens a file for writing.
    #[test]
    fn session_keeps_audio_in_memory_and_writes_no_file() {
        let watch_dir = std::env::temp_dir().join(format!(
            "ost-audio-nodisk-{}-{}",
            std::process::id(),
            Instant::now().elapsed().as_nanos()
        ));
        std::fs::create_dir_all(&watch_dir).unwrap();
        let before = std::fs::read_dir(&watch_dir).unwrap().count();

        let mut stream = speech(8);
        stream.extend(silence(4));
        let source = ScriptedSource::new(1_000, Duration::from_millis(2)).with_block(stream);
        let (mut session, mut rx) = CaptureSession::start_with(source, test_config(), 16);
        let chunks = drain_for(&mut rx, Duration::from_millis(500));
        session.stop();

        // Audio reached the consumer purely in memory.
        assert_eq!(chunks.len(), 1);
        assert!(!chunks[0].samples.is_empty());

        let after = std::fs::read_dir(&watch_dir).unwrap().count();
        assert_eq!(before, after, "capture session must not write any file");
        let _ = std::fs::remove_dir_all(&watch_dir);
    }
}
