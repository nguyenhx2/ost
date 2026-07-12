//! Production [`ServerBackend`] for the managed `llama-server`: real process
//! spawning (`std::process::Command`) + a loopback health check (ADR-006).
//!
//! This is the ONLY place a real `llama-server` child is launched. It is kept
//! out of `server.rs` so the manager's start/stop/readiness logic stays
//! testable against a mock (testing.md: tests never launch a real server).
//!
//! Binary acquisition (first cut): the binary is LOCATED, not bundled or
//! auto-downloaded yet - per-platform bundling/signing is a Step 2 / devops
//! follow-up (ADR-006). Resolution order, first hit wins:
//! 1. `OST_LLAMA_SERVER_PATH` env var (an explicit path);
//! 2. `<home>/.ost/bin/llama-server[.exe]` (the app bin dir the owner drops it
//!    into once);
//! 3. `llama-server[.exe]` found on `PATH`.
//!
//! So the owner places the binary once; the app spawns it - they never hand-run
//! the server.

use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::time::Duration;

use async_trait::async_trait;

use super::server::{ServerBackend, ServerError, ServerProcess, ServerSpec};

/// The `llama-server` executable name for this platform.
#[cfg(windows)]
pub const LLAMA_SERVER_BIN: &str = "llama-server.exe";
#[cfg(not(windows))]
pub const LLAMA_SERVER_BIN: &str = "llama-server";

/// Timeout for one health-check request (the readiness loop repeats it).
const HEALTH_TIMEOUT: Duration = Duration::from_secs(2);

/// Locates the `llama-server` binary (see the module docs for the order).
/// Returns [`ServerError::BinaryNotFound`] when no candidate exists.
pub fn resolve_llama_server_binary() -> Result<PathBuf, ServerError> {
    // 1. Explicit env override.
    if let Some(p) = std::env::var_os("OST_LLAMA_SERVER_PATH") {
        let path = PathBuf::from(p);
        if path.exists() {
            return Ok(path);
        }
        return Err(ServerError::BinaryNotFound(format!(
            "OST_LLAMA_SERVER_PATH is set but does not exist: {}",
            path.display()
        )));
    }

    // 2. App bin dir.
    if let Some(home) = home_dir() {
        let candidate = home.join(".ost").join("bin").join(LLAMA_SERVER_BIN);
        if candidate.exists() {
            return Ok(candidate);
        }
    }

    // 3. PATH scan.
    if let Some(found) = find_on_path(LLAMA_SERVER_BIN) {
        return Ok(found);
    }

    Err(ServerError::BinaryNotFound(format!(
        "set OST_LLAMA_SERVER_PATH, drop {LLAMA_SERVER_BIN} in ~/.ost/bin, or add it to PATH"
    )))
}

/// Scans `PATH` for `name`, returning the first existing match.
fn find_on_path(name: &str) -> Option<PathBuf> {
    let path_var = std::env::var_os("PATH")?;
    std::env::split_paths(&path_var)
        .map(|dir| dir.join(name))
        .find(|candidate| candidate.exists())
}

fn home_dir() -> Option<PathBuf> {
    #[cfg(windows)]
    {
        std::env::var_os("USERPROFILE").map(PathBuf::from)
    }
    #[cfg(not(windows))]
    {
        std::env::var_os("HOME").map(PathBuf::from)
    }
}

/// A real `llama-server` child process.
struct OsServerProcess {
    child: Child,
}

impl ServerProcess for OsServerProcess {
    fn pid(&self) -> Option<u32> {
        Some(self.child.id())
    }

    fn exit_code(&mut self) -> Option<i32> {
        // Non-blocking: `Ok(Some(status))` = exited; `Ok(None)` = still running.
        match self.child.try_wait() {
            Ok(Some(status)) => Some(status.code().unwrap_or(-1)),
            Ok(None) => None,
            // If we cannot even query it, treat it as gone so the manager stops
            // trusting it (fail-closed, crash isolation).
            Err(_) => Some(-1),
        }
    }

    fn kill(&mut self) -> Result<(), ServerError> {
        // Idempotent: killing an already-exited child returns Ok on most
        // platforms; map any real failure to a typed error.
        match self.child.kill() {
            Ok(()) => {
                let _ = self.child.wait();
                Ok(())
            }
            Err(e) if e.kind() == std::io::ErrorKind::InvalidInput => Ok(()), // already gone
            Err(e) => Err(ServerError::Kill(e.to_string())),
        }
    }
}

/// The production spawn + health backend.
pub struct OsServerBackend {
    http: reqwest::Client,
}

impl OsServerBackend {
    /// Backend with a short-timeout, loopback health-check client (redirects
    /// disabled - a loopback health endpoint has no reason to redirect).
    pub fn new() -> Self {
        let http = reqwest::Client::builder()
            .connect_timeout(HEALTH_TIMEOUT)
            .timeout(HEALTH_TIMEOUT)
            .redirect(reqwest::redirect::Policy::none())
            .build()
            // A default client always builds; the closure is only reached on a
            // TLS backend init failure, which is unrecoverable here.
            .unwrap_or_default();
        Self { http }
    }
}

impl Default for OsServerBackend {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl ServerBackend for OsServerBackend {
    fn spawn(
        &self,
        spec: &ServerSpec,
        args: &[String],
    ) -> Result<Box<dyn ServerProcess>, ServerError> {
        let child = Command::new(&spec.binary_path)
            .args(args)
            // The child's stdio is not captured - llama-server logs are noisy
            // and carry nothing sensitive (the translate request never flows
            // through this manager); discard them to avoid a full pipe blocking
            // the child.
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .stdin(Stdio::null())
            .spawn()
            .map_err(|e| ServerError::Spawn(e.to_string()))?;
        Ok(Box::new(OsServerProcess { child }))
    }

    async fn health_check(&self, base_url: &str) -> bool {
        // llama-server exposes `/health` returning 200 once the model is loaded.
        let url = format!("{}/health", base_url.trim_end_matches('/'));
        matches!(self.http.get(&url).send().await, Ok(resp) if resp.status().is_success())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolve_honors_env_override_when_it_exists() {
        let dir = std::env::temp_dir().join(format!("ost-bin-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let bin = dir.join(LLAMA_SERVER_BIN);
        std::fs::write(&bin, b"stub").unwrap();

        let prev = std::env::var_os("OST_LLAMA_SERVER_PATH");
        std::env::set_var("OST_LLAMA_SERVER_PATH", &bin);
        assert_eq!(resolve_llama_server_binary().unwrap(), bin);
        match prev {
            Some(v) => std::env::set_var("OST_LLAMA_SERVER_PATH", v),
            None => std::env::remove_var("OST_LLAMA_SERVER_PATH"),
        }
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn resolve_errors_when_env_path_is_missing() {
        let prev = std::env::var_os("OST_LLAMA_SERVER_PATH");
        std::env::set_var("OST_LLAMA_SERVER_PATH", "/definitely/not/here/llama-server");
        assert!(matches!(
            resolve_llama_server_binary(),
            Err(ServerError::BinaryNotFound(_))
        ));
        match prev {
            Some(v) => std::env::set_var("OST_LLAMA_SERVER_PATH", v),
            None => std::env::remove_var("OST_LLAMA_SERVER_PATH"),
        }
    }

    #[tokio::test]
    async fn health_check_is_false_for_a_dead_port() {
        // Nothing listens on 127.0.0.1:1 - the check must be false, not hang.
        let backend = OsServerBackend::new();
        assert!(!backend.health_check("http://127.0.0.1:1").await);
    }
}
