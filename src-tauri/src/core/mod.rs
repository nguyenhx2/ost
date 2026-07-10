//! Shared Rust core: cross-cutting coordination + measurement that is not owned
//! by any single pipeline (FR-05).
//!
//! - [`session`]: the one-heavy-session-at-a-time discipline (BR-04). At most one
//!   resident heavy model set (the ORT OCR sessions OR the whisper STT context)
//!   may be loaded at a time; starting one pipeline drops the other, and stopping
//!   a session drops its own model, so resources return to the idle baseline
//!   (NFR-PERF-03 idle < 100MB, NFR-REL-02 release-to-idle-in-60s).
//! - [`resource`]: a dependency-free process RAM + CPU probe used to VERIFY the
//!   idle budget (AC-05.1) and the return-to-idle window (AC-05.4).

pub mod resource;
pub mod session;

pub use resource::{ProcessResourceProbe, ResourceSample};
pub use session::{HeavySessionCoordinator, HeavySessionKind, Unloader};
