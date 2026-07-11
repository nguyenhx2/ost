//! Pure decision logic for switching the Settings whisper model (FR-01,
//! TASK-026, BR-08 extended to Settings-time switching).
//!
//! [`decide_switch`] takes only booleans (already-selected / file-present /
//! session-active) so the state machine is exhaustively unit-tested with no
//! filesystem, no consent gate, and no Tauri state. The command layer
//! (`shell::audio_session`) supplies the booleans from real state and maps the
//! decision to IPC effects (persist + swap, or show the per-model download
//! consent disclosure).

/// The outcome of a switch request, before any download.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SwitchDecision {
    /// The requested model is already the active selection - no-op.
    AlreadyCurrent,
    /// The requested model's file is already present on disk: the caller
    /// switches immediately, no download/consent needed.
    Switched,
    /// The requested model is not on disk: the caller must show the exact
    /// download-size disclosure and let the user confirm before fetching
    /// (extends the BR-08 first-run consent-download flow to Settings-time
    /// switching, PRD-FR-01-stt-backend-options section 4 FR-01.STT-3).
    ConsentRequired,
}

/// Errors a switch request can fail with, BEFORE any IO. Never carries audio
/// content or a secret - only the id/hardware/session-state reasons.
#[derive(Debug, Clone, Copy, PartialEq, Eq, thiserror::Error)]
pub enum SwitchError {
    /// The requested id does not name a known catalog entry.
    #[error("unknown STT model id")]
    UnknownModel,
    /// The current hardware profile does not allow this tier (RAM floor or
    /// missing CUDA GPU - `stt::catalog::is_allowed`).
    #[error("model not allowed on this hardware")]
    NotAllowed,
    /// A live audio session is running. Switching mid-session is refused
    /// rather than silently swapping the model under an active transcription
    /// loop; the user stops the session first, then switches.
    #[error("cannot switch the STT model while a session is active")]
    SessionActive,
}

/// Decides the outcome of a switch request. `session_active` is checked FIRST
/// (fail closed on the strongest constraint): switching while a session is
/// running is refused even if the target is already selected or present.
pub fn decide_switch(
    already_selected: bool,
    file_present: bool,
    session_active: bool,
) -> Result<SwitchDecision, SwitchError> {
    if session_active {
        return Err(SwitchError::SessionActive);
    }
    if already_selected {
        return Ok(SwitchDecision::AlreadyCurrent);
    }
    if file_present {
        Ok(SwitchDecision::Switched)
    } else {
        Ok(SwitchDecision::ConsentRequired)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn active_session_is_rejected_regardless_of_other_state() {
        assert_eq!(
            decide_switch(true, true, true),
            Err(SwitchError::SessionActive)
        );
        assert_eq!(
            decide_switch(false, false, true),
            Err(SwitchError::SessionActive)
        );
    }

    #[test]
    fn already_selected_is_a_no_op() {
        assert_eq!(
            decide_switch(true, true, false),
            Ok(SwitchDecision::AlreadyCurrent)
        );
        // Even if (inconsistently) the file were reported absent, "already
        // selected" wins - there is nothing to switch to.
        assert_eq!(
            decide_switch(true, false, false),
            Ok(SwitchDecision::AlreadyCurrent)
        );
    }

    #[test]
    fn present_file_switches_immediately_without_consent() {
        assert_eq!(
            decide_switch(false, true, false),
            Ok(SwitchDecision::Switched)
        );
    }

    #[test]
    fn absent_file_requires_consent() {
        assert_eq!(
            decide_switch(false, false, false),
            Ok(SwitchDecision::ConsentRequired)
        );
    }
}
