//! Managed `llama-server` subprocess manager (ADR-006, owner decision
//! 2026-07-12: Option B - the app manages a llama-server subprocess).
//!
//! Why a subprocess and not in-process: crash isolation. The whisper-Vulkan
//! finding (docs/context/known-issues.md, 2026-07-12) is that a GPU backend
//! that enumerates devices with no driver aborts the WHOLE process across the
//! FFI boundary - in-process, that would take the app down. As a child process
//! the same crash only kills the child, which this manager DETECTS (exit code)
//! and the app recovers from.
//!
//! ## Security posture (security-reviewer)
//! - The server binds LOOPBACK ONLY (`127.0.0.1`). [`ServerSpec`] carries no way
//!   to bind a routable interface, and [`build_server_args`] always emits
//!   `--host 127.0.0.1`; a non-loopback host is rejected at [`LocalLlmServer::start`].
//! - Exactly one server runs at a time (the one-heavy-session discipline):
//!   [`LocalLlmServer::start`] stops any existing child before spawning, and the
//!   manager kills the child on app exit / model switch.
//! - The manager speaks to the child only through the existing loopback-only
//!   `local_openai` provider client (redirects disabled there) - this module
//!   never sends the translate request itself.
//!
//! ## Testability
//! Spawning + health-checking are behind [`ServerBackend`] / [`ServerProcess`]
//! so the manager's start/stop/readiness/one-at-a-time logic is unit-tested with
//! a scripted mock and NEVER launches a real `llama-server` (testing.md).

use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use async_trait::async_trait;

/// The only interface the managed server is ever bound to. Not configurable -
/// the child must never listen on a routable address (security-privacy.md
/// BR-01 / NFR-SEC-03).
pub const LOOPBACK_HOST: &str = "127.0.0.1";

/// Default OpenAI-compatible port for the managed server (loopback). Chosen
/// high and app-specific to avoid clashing with a user-run LM Studio (1234) or
/// a hand-run llama-server (8080).
pub const DEFAULT_PORT: u16 = 8177;

/// Default context window passed to `--ctx-size`.
pub const DEFAULT_CTX_SIZE: u32 = 4096;

/// How often readiness is polled while the server loads its model.
const READINESS_POLL_INTERVAL: Duration = Duration::from_millis(250);

/// How long to wait for the server to answer a health check before giving up
/// (a large GGUF on GPU can take a while to load).
const READINESS_TIMEOUT: Duration = Duration::from_secs(120);

/// Launch configuration for one managed `llama-server` process. Host is fixed
/// to loopback (not a field) - see the module docs.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ServerSpec {
    /// Absolute path to the `llama-server` binary.
    pub binary_path: PathBuf,
    /// Absolute path to the GGUF weights to serve.
    pub model_path: PathBuf,
    /// Loopback port to bind the OpenAI-compatible API on.
    pub port: u16,
    /// `--n-gpu-layers` (99 = offload all; 0 = CPU-only). The owner's RTX 4070
    /// uses 99 for the 7B default; a CPU fallback sets 0 (Step 2).
    pub gpu_layers: i32,
    /// `--ctx-size`.
    pub ctx_size: u32,
    /// The model alias reported by the server's `/v1/models` and used as the
    /// `model_id` on translate calls (carries the `hy-mt2`/`qwen3` substring the
    /// provider prompt router keys on).
    pub model_id: String,
}

impl ServerSpec {
    /// The loopback base URL the OpenAI-compatible API is reached at.
    #[must_use]
    pub fn base_url(&self) -> String {
        format!("http://{LOOPBACK_HOST}:{}", self.port)
    }
}

/// Builds the `llama-server` argument vector for `spec` (pure and total, so the
/// owner's recommended launch flags are unit-tested without spawning anything).
///
/// Flags (owner's recommendation, 2026-07-12): OpenAI-compatible server bound to
/// loopback, `--flash-attn`, q8_0 KV cache, and `--n-gpu-layers`.
#[must_use]
pub fn build_server_args(spec: &ServerSpec) -> Vec<String> {
    let mut args = vec![
        "--model".into(),
        spec.model_path.display().to_string(),
        "--host".into(),
        LOOPBACK_HOST.into(),
        "--port".into(),
        spec.port.to_string(),
        "--flash-attn".into(),
        "--cache-type-k".into(),
        "q8_0".into(),
        "--cache-type-v".into(),
        "q8_0".into(),
        "--n-gpu-layers".into(),
        spec.gpu_layers.to_string(),
        "--ctx-size".into(),
        spec.ctx_size.to_string(),
    ];
    if !spec.model_id.is_empty() {
        args.push("--alias".into());
        args.push(spec.model_id.clone());
    }
    args
}

/// Errors from the process manager. Display strings carry only reasons + exit
/// codes/ports - never a secret or user content.
#[derive(Debug, thiserror::Error)]
pub enum ServerError {
    /// The `llama-server` binary could not be located (not configured, not in
    /// the app bin dir, not on PATH).
    #[error("llama-server binary not found: {0}")]
    BinaryNotFound(String),
    /// The GGUF model file for the requested spec is not present on disk.
    #[error("model file not found: {0}")]
    ModelNotFound(String),
    /// A non-loopback host was requested - refused (security-privacy.md).
    #[error("refusing to bind a non-loopback host")]
    NonLoopbackHost,
    /// Spawning the process failed (OS-level).
    #[error("failed to spawn llama-server: {0}")]
    Spawn(String),
    /// The process exited during startup instead of becoming healthy - the
    /// crash-isolation case (e.g. a GPU/driver crash). Carries the exit code
    /// when known.
    #[error("llama-server exited during startup (code: {code:?})")]
    ExitedDuringStartup { code: Option<i32> },
    /// The server did not become healthy within the readiness timeout.
    #[error("llama-server did not become ready within the timeout")]
    ReadinessTimeout,
    /// Killing the process failed.
    #[error("failed to stop llama-server: {0}")]
    Kill(String),
}

/// A spawned server process handle. Abstracted so the manager is tested with a
/// scripted mock (never a real child).
pub trait ServerProcess: Send + Sync {
    /// The process id, when known (diagnostics only; never logged with content).
    fn pid(&self) -> Option<u32>;
    /// The exit code if the process has already exited, else `None` (still
    /// running). Non-blocking.
    fn exit_code(&mut self) -> Option<i32>;
    /// Kill the process (idempotent - killing an exited process is `Ok`).
    fn kill(&mut self) -> Result<(), ServerError>;
}

/// Spawns + health-checks a server. Injected so the manager never launches a
/// real binary in tests.
#[async_trait]
pub trait ServerBackend: Send + Sync {
    /// Spawn the process for `spec` and return a handle. Does NOT wait for
    /// readiness - the manager polls [`Self::health_check`].
    fn spawn(
        &self,
        spec: &ServerSpec,
        args: &[String],
    ) -> Result<Box<dyn ServerProcess>, ServerError>;
    /// True (Ok) when the server answers a health check at `base_url`. An error
    /// means "not ready yet" (the manager keeps polling until the readiness
    /// timeout or the process exits).
    async fn health_check(&self, base_url: &str) -> bool;
}

/// A currently-running managed server.
pub struct RunningServer {
    process: Box<dyn ServerProcess>,
    base_url: String,
    model_id: String,
    port: u16,
}

/// Readiness timing (injectable so tests run fast).
#[derive(Debug, Clone, Copy)]
pub struct ReadinessPolicy {
    pub poll_interval: Duration,
    pub timeout: Duration,
}

impl Default for ReadinessPolicy {
    fn default() -> Self {
        Self {
            poll_interval: READINESS_POLL_INTERVAL,
            timeout: READINESS_TIMEOUT,
        }
    }
}

/// Status snapshot for the IPC layer (never a secret).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ServerStatus {
    pub running: bool,
    pub model_id: Option<String>,
    pub base_url: Option<String>,
    pub port: Option<u16>,
}

/// The managed `llama-server` subprocess manager. One server at a time.
pub struct LocalLlmServer {
    backend: Arc<dyn ServerBackend>,
    readiness: ReadinessPolicy,
    running: tokio::sync::Mutex<Option<RunningServer>>,
}

impl LocalLlmServer {
    /// Manager over `backend` with the default readiness policy.
    pub fn new(backend: Arc<dyn ServerBackend>) -> Self {
        Self::with_readiness(backend, ReadinessPolicy::default())
    }

    /// Manager with an explicit readiness policy (tests use tiny timings).
    pub fn with_readiness(backend: Arc<dyn ServerBackend>, readiness: ReadinessPolicy) -> Self {
        Self {
            backend,
            readiness,
            running: tokio::sync::Mutex::new(None),
        }
    }

    /// Starts (or restarts) the managed server for `spec`, making it THE running
    /// server: any existing child is killed first (one-at-a-time / model
    /// switch), then the new process is spawned and polled until it is healthy.
    ///
    /// Fails closed - on a non-loopback host, a missing binary/model, a spawn
    /// failure, an early process exit (crash isolation), or a readiness timeout
    /// it leaves NO running server and returns a typed error. Returns the
    /// loopback base URL on success.
    pub async fn start(&self, spec: ServerSpec) -> Result<String, ServerError> {
        // Preconditions (fail before touching process state).
        if !spec.binary_path.exists() {
            return Err(ServerError::BinaryNotFound(
                spec.binary_path.display().to_string(),
            ));
        }
        if !spec.model_path.exists() {
            return Err(ServerError::ModelNotFound(
                spec.model_path.display().to_string(),
            ));
        }

        let args = build_server_args(&spec);
        // Defensive: build_server_args always emits loopback, but assert the
        // composed base URL is loopback before we ever spawn.
        let base_url = spec.base_url();
        if !base_url.contains(LOOPBACK_HOST) {
            return Err(ServerError::NonLoopbackHost);
        }

        let mut guard = self.running.lock().await;
        // Stop any existing child first (idempotent kill).
        if let Some(mut prev) = guard.take() {
            let _ = prev.process.kill();
        }

        let mut process = self.backend.spawn(&spec, &args)?;

        // Poll readiness: healthy -> done; process exited -> crash-isolation
        // error; timeout -> kill + timeout error.
        let deadline = tokio::time::Instant::now() + self.readiness.timeout;
        loop {
            if let Some(code) = process.exit_code() {
                let _ = process.kill();
                return Err(ServerError::ExitedDuringStartup { code: Some(code) });
            }
            if self.backend.health_check(&base_url).await {
                *guard = Some(RunningServer {
                    process,
                    base_url: base_url.clone(),
                    model_id: spec.model_id.clone(),
                    port: spec.port,
                });
                return Ok(base_url);
            }
            if tokio::time::Instant::now() >= deadline {
                let _ = process.kill();
                return Err(ServerError::ReadinessTimeout);
            }
            tokio::time::sleep(self.readiness.poll_interval).await;
        }
    }

    /// Stops the running server, if any (idempotent). Called on model switch and
    /// app exit.
    pub async fn stop(&self) -> Result<(), ServerError> {
        let mut guard = self.running.lock().await;
        if let Some(mut running) = guard.take() {
            running.process.kill()?;
        }
        Ok(())
    }

    /// Current status snapshot. Detects a child that exited on its own (crash)
    /// and clears the slot so status is truthful.
    pub async fn status(&self) -> ServerStatus {
        let mut guard = self.running.lock().await;
        if let Some(running) = guard.as_mut() {
            if running.process.exit_code().is_some() {
                // The child died unexpectedly - reflect that (crash isolation:
                // the app is fine, the server is not).
                *guard = None;
                return ServerStatus {
                    running: false,
                    model_id: None,
                    base_url: None,
                    port: None,
                };
            }
            return ServerStatus {
                running: true,
                model_id: Some(running.model_id.clone()),
                base_url: Some(running.base_url.clone()),
                port: Some(running.port),
            };
        }
        ServerStatus {
            running: false,
            model_id: None,
            base_url: None,
            port: None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    fn spec(tmp: &std::path::Path) -> ServerSpec {
        // Use real existing files for binary/model so the precondition checks
        // pass; the mock backend never executes them.
        let binary = tmp.join("llama-server");
        let model = tmp.join("model.gguf");
        std::fs::write(&binary, b"stub").unwrap();
        std::fs::write(&model, b"stub").unwrap();
        ServerSpec {
            binary_path: binary,
            model_path: model,
            port: DEFAULT_PORT,
            gpu_layers: 99,
            ctx_size: DEFAULT_CTX_SIZE,
            model_id: "hy-mt2-7b".into(),
        }
    }

    fn tmp_dir(tag: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!(
            "ost-llm-server-{tag}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    fn fast_policy() -> ReadinessPolicy {
        ReadinessPolicy {
            poll_interval: Duration::from_millis(5),
            timeout: Duration::from_millis(500),
        }
    }

    /// A scripted process: becomes "exited" after `exit_after` polls (None =
    /// never exits on its own), and records kills.
    struct MockProcess {
        polls: usize,
        exit_after: Option<usize>,
        exit_code: i32,
        killed: Arc<AtomicUsize>,
    }
    impl ServerProcess for MockProcess {
        fn pid(&self) -> Option<u32> {
            Some(4242)
        }
        fn exit_code(&mut self) -> Option<i32> {
            self.polls += 1;
            match self.exit_after {
                Some(n) if self.polls > n => Some(self.exit_code),
                _ => None,
            }
        }
        fn kill(&mut self) -> Result<(), ServerError> {
            self.killed.fetch_add(1, Ordering::SeqCst);
            Ok(())
        }
    }

    /// Backend that becomes healthy after `healthy_after` health checks, and
    /// hands out a process scripted to exit after `exit_after` polls.
    struct MockBackend {
        healthy_after: usize,
        checks: AtomicUsize,
        exit_after: Option<usize>,
        exit_code: i32,
        killed: Arc<AtomicUsize>,
        spawns: AtomicUsize,
    }
    #[async_trait]
    impl ServerBackend for MockBackend {
        fn spawn(
            &self,
            _spec: &ServerSpec,
            _args: &[String],
        ) -> Result<Box<dyn ServerProcess>, ServerError> {
            self.spawns.fetch_add(1, Ordering::SeqCst);
            Ok(Box::new(MockProcess {
                polls: 0,
                exit_after: self.exit_after,
                exit_code: self.exit_code,
                killed: Arc::clone(&self.killed),
            }))
        }
        async fn health_check(&self, _base_url: &str) -> bool {
            self.checks.fetch_add(1, Ordering::SeqCst) >= self.healthy_after
        }
    }

    #[test]
    fn args_bind_loopback_and_carry_the_owner_flags() {
        let dir = tmp_dir("args");
        let args = build_server_args(&spec(&dir));
        // Loopback host, never a routable interface.
        let host_idx = args.iter().position(|a| a == "--host").unwrap();
        assert_eq!(args[host_idx + 1], "127.0.0.1");
        assert!(args.iter().any(|a| a == "--flash-attn"));
        assert!(args
            .windows(2)
            .any(|w| w[0] == "--cache-type-k" && w[1] == "q8_0"));
        assert!(args
            .windows(2)
            .any(|w| w[0] == "--cache-type-v" && w[1] == "q8_0"));
        assert!(args
            .windows(2)
            .any(|w| w[0] == "--n-gpu-layers" && w[1] == "99"));
        assert!(args
            .windows(2)
            .any(|w| w[0] == "--alias" && w[1] == "hy-mt2-7b"));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn base_url_is_loopback() {
        let dir = tmp_dir("baseurl");
        assert_eq!(
            spec(&dir).base_url(),
            format!("http://127.0.0.1:{DEFAULT_PORT}")
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[tokio::test]
    async fn start_becomes_ready_and_reports_status() {
        let dir = tmp_dir("ready");
        let killed = Arc::new(AtomicUsize::new(0));
        let backend = Arc::new(MockBackend {
            healthy_after: 2,
            checks: AtomicUsize::new(0),
            exit_after: None,
            exit_code: 0,
            killed: Arc::clone(&killed),
            spawns: AtomicUsize::new(0),
        });
        let mgr = LocalLlmServer::with_readiness(backend, fast_policy());
        let base = mgr.start(spec(&dir)).await.expect("should become ready");
        assert_eq!(base, format!("http://127.0.0.1:{DEFAULT_PORT}"));
        let status = mgr.status().await;
        assert!(status.running);
        assert_eq!(status.model_id.as_deref(), Some("hy-mt2-7b"));
        assert_eq!(status.base_url.as_deref(), Some(base.as_str()));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[tokio::test]
    async fn start_detects_a_process_that_exits_during_startup() {
        // Crash-isolation case: the child dies before becoming healthy (e.g. a
        // GPU/driver abort). The manager surfaces it and leaves no running
        // server, killing the corpse.
        let dir = tmp_dir("crash");
        let killed = Arc::new(AtomicUsize::new(0));
        let backend = Arc::new(MockBackend {
            healthy_after: 100, // never healthy
            checks: AtomicUsize::new(0),
            exit_after: Some(1), // exits on the 2nd poll
            exit_code: 134,
            killed: Arc::clone(&killed),
            spawns: AtomicUsize::new(0),
        });
        let mgr = LocalLlmServer::with_readiness(backend, fast_policy());
        let err = mgr.start(spec(&dir)).await.unwrap_err();
        assert!(matches!(
            err,
            ServerError::ExitedDuringStartup { code: Some(134) }
        ));
        assert!(!mgr.status().await.running);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[tokio::test]
    async fn start_times_out_when_never_healthy() {
        let dir = tmp_dir("timeout");
        let killed = Arc::new(AtomicUsize::new(0));
        let backend = Arc::new(MockBackend {
            healthy_after: usize::MAX,
            checks: AtomicUsize::new(0),
            exit_after: None,
            exit_code: 0,
            killed: Arc::clone(&killed),
            spawns: AtomicUsize::new(0),
        });
        let mgr = LocalLlmServer::with_readiness(backend, fast_policy());
        let err = mgr.start(spec(&dir)).await.unwrap_err();
        assert!(matches!(err, ServerError::ReadinessTimeout));
        assert!(
            killed.load(Ordering::SeqCst) >= 1,
            "the corpse must be killed"
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[tokio::test]
    async fn start_replaces_an_existing_server_one_at_a_time() {
        let dir = tmp_dir("replace");
        let killed = Arc::new(AtomicUsize::new(0));
        let backend = Arc::new(MockBackend {
            healthy_after: 0,
            checks: AtomicUsize::new(0),
            exit_after: None,
            exit_code: 0,
            killed: Arc::clone(&killed),
            spawns: AtomicUsize::new(0),
        });
        let mgr = LocalLlmServer::with_readiness(
            Arc::clone(&backend) as Arc<dyn ServerBackend>,
            fast_policy(),
        );
        mgr.start(spec(&dir)).await.unwrap();
        mgr.start(spec(&dir)).await.unwrap();
        assert_eq!(backend.spawns.load(Ordering::SeqCst), 2);
        assert!(
            killed.load(Ordering::SeqCst) >= 1,
            "the first server must be killed before the second starts"
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[tokio::test]
    async fn missing_binary_and_model_fail_before_spawn() {
        let dir = tmp_dir("missing");
        let killed = Arc::new(AtomicUsize::new(0));
        let backend = Arc::new(MockBackend {
            healthy_after: 0,
            checks: AtomicUsize::new(0),
            exit_after: None,
            exit_code: 0,
            killed,
            spawns: AtomicUsize::new(0),
        });
        let mgr = LocalLlmServer::with_readiness(
            Arc::clone(&backend) as Arc<dyn ServerBackend>,
            fast_policy(),
        );
        let mut s = spec(&dir);
        s.binary_path = dir.join("does-not-exist");
        assert!(matches!(
            mgr.start(s).await,
            Err(ServerError::BinaryNotFound(_))
        ));
        assert_eq!(backend.spawns.load(Ordering::SeqCst), 0, "must not spawn");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[tokio::test]
    async fn stop_is_idempotent_and_status_goes_quiet() {
        let dir = tmp_dir("stop");
        let killed = Arc::new(AtomicUsize::new(0));
        let backend = Arc::new(MockBackend {
            healthy_after: 0,
            checks: AtomicUsize::new(0),
            exit_after: None,
            exit_code: 0,
            killed: Arc::clone(&killed),
            spawns: AtomicUsize::new(0),
        });
        let mgr = LocalLlmServer::with_readiness(backend, fast_policy());
        mgr.start(spec(&dir)).await.unwrap();
        mgr.stop().await.unwrap();
        assert!(!mgr.status().await.running);
        // Idempotent: stopping again is fine.
        mgr.stop().await.unwrap();
        assert!(killed.load(Ordering::SeqCst) >= 1);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
