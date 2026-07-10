//! One-heavy-session-at-a-time discipline (BR-04 / FR-05).
//!
//! Two pipelines own heavy, resident model sets: the region OCR pipeline (the
//! oar-ocr ORT sessions, ~94MB resident, TASK-007) and the audio STT pipeline
//! (the whisper.cpp context, heavier still, TASK-015). Running both at once would
//! blow the idle/active RAM budget, so the invariant is: AT MOST ONE heavy model
//! set is resident at a time.
//!
//! [`HeavySessionCoordinator`] is the seam that enforces it. Each pipeline
//! registers an [`Unloader`] closure that drops ITS model (it reuses the existing
//! `PaddleOcrEngine::unload()` / `WhisperStt::unload()` APIs - this layer never
//! reimplements them). When a pipeline starts it calls [`HeavySessionCoordinator::begin`],
//! which drops every OTHER registered heavy set; when it stops it calls
//! [`HeavySessionCoordinator::end`], which drops its own. The result: the machine
//! is never carrying two heavy sessions, and a stopped session leaves nothing
//! resident (return-to-idle, AC-05.4).
//!
//! The coordinator is model-agnostic and I/O-free, so the discipline is unit-
//! tested with counter unloaders - no real ORT/whisper session required.

use std::sync::{Arc, Mutex};

/// A registered unload hook: dropping the caller's resident heavy model set. It
/// wraps the pipeline's existing `unload()` (idempotent), so the coordinator can
/// release another pipeline's model without knowing its internals.
pub type Unloader = Arc<dyn Fn() + Send + Sync>;

/// Which heavy pipeline a resident model set belongs to. Exactly two kinds today;
/// the array-indexed state below keys off [`HeavySessionKind::index`].
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HeavySessionKind {
    /// The audio speech-to-text pipeline (whisper.cpp context).
    Stt,
    /// The region OCR pipeline (oar-ocr ORT sessions).
    Ocr,
}

impl HeavySessionKind {
    /// Stable slot index into the coordinator's fixed-size unloader table.
    const fn index(self) -> usize {
        match self {
            HeavySessionKind::Stt => 0,
            HeavySessionKind::Ocr => 1,
        }
    }
}

/// Number of distinct heavy kinds (Stt, Ocr). Kept in one place so the fixed
/// unloader table and the iteration stay in sync.
const KIND_COUNT: usize = 2;

#[derive(Default)]
struct CoordinatorState {
    /// The heavy kind currently marked resident, if any.
    active: Option<HeavySessionKind>,
    /// Per-kind unload hooks (slot index = [`HeavySessionKind::index`]).
    unloaders: [Option<Unloader>; KIND_COUNT],
}

/// Enforces the one-heavy-session-at-a-time invariant (BR-04). Cheap to
/// construct and clone-shared via [`Arc`]; both pipelines hold a handle and
/// register their unloader at wiring time.
#[derive(Default)]
pub struct HeavySessionCoordinator {
    state: Mutex<CoordinatorState>,
}

impl HeavySessionCoordinator {
    /// A fresh coordinator with no pipelines registered and nothing resident.
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    /// Registers (or replaces) the unload hook for `kind`. Called once at wiring
    /// time per pipeline; the hook wraps that pipeline's existing `unload()`.
    pub fn register(&self, kind: HeavySessionKind, unloader: Unloader) {
        if let Ok(mut state) = self.state.lock() {
            state.unloaders[kind.index()] = Some(unloader);
        }
    }

    /// Starts a heavy session of `kind`: drops EVERY other registered heavy model
    /// set (enforcing the single-resident invariant) and records `kind` as the
    /// active session. Idempotent for the same kind.
    ///
    /// Unloaders run AFTER the lock is released so a hook can never re-enter the
    /// coordinator and deadlock.
    pub fn begin(&self, kind: HeavySessionKind) {
        let mut to_unload: Vec<Unloader> = Vec::new();
        if let Ok(mut state) = self.state.lock() {
            for (idx, slot) in state.unloaders.iter().enumerate() {
                if idx != kind.index() {
                    if let Some(unloader) = slot {
                        to_unload.push(Arc::clone(unloader));
                    }
                }
            }
            state.active = Some(kind);
        }
        for unloader in to_unload {
            unloader();
        }
    }

    /// Ends the heavy session of `kind`: drops its own resident model set and, if
    /// it was the active session, clears the active marker. Idempotent - safe to
    /// call with nothing running.
    pub fn end(&self, kind: HeavySessionKind) {
        let own = {
            let mut state = match self.state.lock() {
                Ok(state) => state,
                Err(_) => return,
            };
            if state.active == Some(kind) {
                state.active = None;
            }
            state.unloaders[kind.index()].as_ref().map(Arc::clone)
        };
        if let Some(unloader) = own {
            unloader();
        }
    }

    /// Drops every registered heavy model set and clears the active marker: the
    /// full return-to-idle path (e.g. app suspend / shutdown). Idempotent.
    pub fn unload_all(&self) {
        let unloaders: Vec<Unloader> = {
            let mut state = match self.state.lock() {
                Ok(state) => state,
                Err(_) => return,
            };
            state.active = None;
            state
                .unloaders
                .iter()
                .filter_map(|slot| slot.as_ref().map(Arc::clone))
                .collect()
        };
        for unloader in unloaders {
            unloader();
        }
    }

    /// The heavy kind currently marked resident, if any (test/observability).
    #[must_use]
    pub fn active(&self) -> Option<HeavySessionKind> {
        self.state.lock().ok().and_then(|state| state.active)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    /// A counter-backed unloader standing in for a real `unload()`: records how
    /// many times it was invoked so a test can prove the discipline without any
    /// ORT/whisper session (testing.md: synthetic only).
    fn counting_unloader() -> (Unloader, Arc<AtomicUsize>) {
        let count = Arc::new(AtomicUsize::new(0));
        let hook_count = Arc::clone(&count);
        let hook: Unloader = Arc::new(move || {
            hook_count.fetch_add(1, Ordering::SeqCst);
        });
        (hook, count)
    }

    #[test]
    fn starting_stt_unloads_a_resident_ocr_session() {
        // "starting audio drops any resident OCR session": begin(Stt) must invoke
        // the OCR unloader and leave the STT model untouched.
        let coord = HeavySessionCoordinator::new();
        let (stt_hook, stt_calls) = counting_unloader();
        let (ocr_hook, ocr_calls) = counting_unloader();
        coord.register(HeavySessionKind::Stt, stt_hook);
        coord.register(HeavySessionKind::Ocr, ocr_hook);

        coord.begin(HeavySessionKind::Stt);

        assert_eq!(ocr_calls.load(Ordering::SeqCst), 1, "OCR must be unloaded");
        assert_eq!(stt_calls.load(Ordering::SeqCst), 0, "STT stays resident");
        assert_eq!(coord.active(), Some(HeavySessionKind::Stt));
    }

    #[test]
    fn starting_ocr_unloads_a_resident_stt_session() {
        // "and vice versa": begin(Ocr) drops the whisper STT context.
        let coord = HeavySessionCoordinator::new();
        let (stt_hook, stt_calls) = counting_unloader();
        let (ocr_hook, ocr_calls) = counting_unloader();
        coord.register(HeavySessionKind::Stt, stt_hook);
        coord.register(HeavySessionKind::Ocr, ocr_hook);

        coord.begin(HeavySessionKind::Ocr);

        assert_eq!(stt_calls.load(Ordering::SeqCst), 1, "STT must be unloaded");
        assert_eq!(ocr_calls.load(Ordering::SeqCst), 0, "OCR stays resident");
        assert_eq!(coord.active(), Some(HeavySessionKind::Ocr));
    }

    #[test]
    fn ending_a_session_unloads_its_own_model_and_clears_active() {
        // AC-05.4: after stop, the session's model is dropped (nothing resident).
        let coord = HeavySessionCoordinator::new();
        let (stt_hook, stt_calls) = counting_unloader();
        coord.register(HeavySessionKind::Stt, stt_hook);

        coord.begin(HeavySessionKind::Stt);
        assert_eq!(coord.active(), Some(HeavySessionKind::Stt));

        coord.end(HeavySessionKind::Stt);
        assert_eq!(stt_calls.load(Ordering::SeqCst), 1, "own model unloaded");
        assert_eq!(coord.active(), None, "no session resident after stop");
    }

    #[test]
    fn after_a_full_cycle_both_models_are_unloaded() {
        // Start OCR (drops STT), then stop OCR (drops OCR): both unloaders ran and
        // nothing is marked resident - the true-idle state (AC-05.1 / AC-05.4).
        let coord = HeavySessionCoordinator::new();
        let (stt_hook, stt_calls) = counting_unloader();
        let (ocr_hook, ocr_calls) = counting_unloader();
        coord.register(HeavySessionKind::Stt, stt_hook);
        coord.register(HeavySessionKind::Ocr, ocr_hook);

        coord.begin(HeavySessionKind::Ocr); // drops resident STT
        coord.end(HeavySessionKind::Ocr); // drops OCR itself

        assert!(stt_calls.load(Ordering::SeqCst) >= 1, "STT was unloaded");
        assert_eq!(ocr_calls.load(Ordering::SeqCst), 1, "OCR was unloaded");
        assert_eq!(coord.active(), None);
    }

    #[test]
    fn unload_all_drops_every_registered_model() {
        let coord = HeavySessionCoordinator::new();
        let (stt_hook, stt_calls) = counting_unloader();
        let (ocr_hook, ocr_calls) = counting_unloader();
        coord.register(HeavySessionKind::Stt, stt_hook);
        coord.register(HeavySessionKind::Ocr, ocr_hook);

        coord.unload_all();

        assert_eq!(stt_calls.load(Ordering::SeqCst), 1);
        assert_eq!(ocr_calls.load(Ordering::SeqCst), 1);
        assert_eq!(coord.active(), None);
    }

    #[test]
    fn begin_and_end_are_no_ops_without_registration() {
        // A coordinator with no pipelines wired must not panic (defensive: the
        // wiring order in lib.rs registers before any session can start).
        let coord = HeavySessionCoordinator::new();
        coord.begin(HeavySessionKind::Stt);
        assert_eq!(coord.active(), Some(HeavySessionKind::Stt));
        coord.end(HeavySessionKind::Stt);
        assert_eq!(coord.active(), None);
    }

    #[test]
    fn switching_pipelines_keeps_only_one_resident() {
        // The core invariant across a switch: OCR running, then audio starts ->
        // OCR is dropped and STT is the only resident kind.
        let coord = HeavySessionCoordinator::new();
        let (stt_hook, stt_calls) = counting_unloader();
        let (ocr_hook, ocr_calls) = counting_unloader();
        coord.register(HeavySessionKind::Stt, stt_hook);
        coord.register(HeavySessionKind::Ocr, ocr_hook);

        coord.begin(HeavySessionKind::Ocr);
        assert_eq!(coord.active(), Some(HeavySessionKind::Ocr));
        // Starting OCR dropped the resident STT once (and STT only).
        assert_eq!(stt_calls.load(Ordering::SeqCst), 1, "STT dropped for OCR");
        assert_eq!(ocr_calls.load(Ordering::SeqCst), 0);

        coord.begin(HeavySessionKind::Stt); // switch to audio
        assert_eq!(coord.active(), Some(HeavySessionKind::Stt));
        // The switch dropped OCR; STT's own unloader did NOT fire from starting it
        // (still just the single drop from the earlier begin(Ocr)).
        assert_eq!(ocr_calls.load(Ordering::SeqCst), 1, "OCR dropped on switch");
        assert_eq!(stt_calls.load(Ordering::SeqCst), 1);
    }
}
