//! Generic, model-agnostic streaming download engine for the shared model
//! facility (`crate::models`).
//!
//! This is the bounded, cancellable, incrementally-hashed HTTPS fetch every
//! self-fetching model consumer needs. It is the SHARED home for the pattern
//! `stt::download` established first (fail-closed consent is enforced by the
//! caller BEFORE this runs; this module never fetches without the caller having
//! passed the [`crate::models::ModelGate`]); the local-LLM GGUF downloader
//! (`crate::llm::download`) is the first consumer of this generic form.
//!
//! What it guarantees (security-privacy.md supply-chain, TASK-026 review fixes
//! carried forward):
//! - bytes are written straight to a temp file as they arrive (never buffered
//!   whole in memory) and hashed INCREMENTALLY;
//! - the transfer is bounded by an IDLE timeout (no bytes for N seconds =
//!   stalled, aborted - applied to both the initial response wait and every
//!   chunk) and an OVERALL wall-clock backstop;
//! - a transfer that exceeds a caller-supplied oversize cap (a sane multiple of
//!   the model's PINNED approximate size, never the untrusted server
//!   `Content-Length`) is aborted rather than streamed unbounded onto disk;
//! - a caller-flipped cancel flag aborts the stream cleanly.
//!
//! It deliberately does NOT verify, rename, or clean up: it returns the
//! lowercase-hex SHA-256 of the streamed bytes and leaves the temp file in
//! place. The caller compares that digest against its pin (or records it,
//! trust-on-first-use) and renames the temp file into place on success or
//! removes it on any error. Keeping verification out of the engine lets both
//! the fail-closed pinned path and the record-actual-hash path share one
//! streaming core.

use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use sha2::{Digest, Sha256};
use tokio::io::AsyncWriteExt;
use tokio::time::timeout;

/// A per-download cancel signal. A consumer flips it to abort an in-progress
/// stream; the loop observes it within [`CANCEL_POLL_INTERVAL`] and returns
/// [`StreamDownloadError::Cancelled`]. A fresh, never-flipped flag is a no-op
/// cancel source for callers that do not need cancellation.
pub type CancelFlag = Arc<AtomicBool>;

/// Poll interval for the cancel flag while waiting on network I/O. Bounds how
/// quickly a cancel takes effect without a second notification channel.
const CANCEL_POLL_INTERVAL: Duration = Duration::from_millis(150);

/// Bounds applied to one streaming download (see the module docs). Parameterized
/// (rather than compiled-in constants) so tests exercise the stall/oversize
/// behaviour against a local mock server with tiny bounds.
#[derive(Debug, Clone, Copy)]
pub struct DownloadBounds {
    /// A response wait or chunk read producing nothing within this window is
    /// treated as a stalled connection and aborted.
    pub idle_timeout: Duration,
    /// Absolute wall-clock backstop for a transfer that trickles just often
    /// enough to never trip the idle guard but crawls forever.
    pub overall_timeout: Duration,
    /// Hard cap on total bytes written: a transfer exceeding it is aborted
    /// (must be derived from the model's TRUSTED pinned size, never the
    /// server-supplied `Content-Length`).
    pub oversize_cap: u64,
}

/// Errors from the generic streaming download. Display strings carry only
/// transport reasons and byte counts - never user content, a secret, or an
/// absolute user path (the caller adds a filename label when mapping to its own
/// error surface).
#[derive(Debug, thiserror::Error)]
pub enum StreamDownloadError {
    /// The HTTPS fetch failed (network/transport/HTTP status).
    #[error("download failed: {0}")]
    Network(String),

    /// The download made no progress (idle) for too long, or ran past its
    /// overall time budget - a stalled/hung transfer.
    #[error("download timed out: {detail}")]
    Timeout { detail: String },

    /// The transfer exceeded the oversize cap and was aborted.
    #[error("download exceeded the expected size and was aborted")]
    Oversize,

    /// Writing the streamed bytes to the temp file failed.
    #[error("could not write the download to disk: {0}")]
    Io(String),

    /// The caller cancelled the in-progress download. Not a failure - the
    /// caller cleans up the partial temp file exactly as for any other abort.
    #[error("download was cancelled")]
    Cancelled,
}

/// Resolves once `flag` is set - races a network wait against a cancellation
/// request via `tokio::select!`.
async fn wait_for_cancel(flag: &AtomicBool) {
    loop {
        if flag.load(Ordering::SeqCst) {
            return;
        }
        tokio::time::sleep(CANCEL_POLL_INTERVAL).await;
    }
}

/// Builds the [`StreamDownloadError::Timeout`] for an idle (no-data) stall.
fn stalled(idle_timeout: Duration) -> StreamDownloadError {
    StreamDownloadError::Timeout {
        detail: format!(
            "no data received for {}s (stalled connection)",
            idle_timeout.as_secs()
        ),
    }
}

/// Streams `url` into `tmp` (never buffering the whole artifact in memory),
/// hashing incrementally, and returns the lowercase-hex SHA-256 of the streamed
/// bytes. Bounded by `bounds` and observing `cancel`; invokes
/// `on_progress(downloaded, total)` after every chunk (`total` falls back to
/// `approx_total` when the server omits `Content-Length`).
///
/// Does NOT verify the digest, rename the temp file, or remove it on error -
/// that is the caller's contract (see the module docs).
pub async fn stream_download_to_file<F>(
    client: &reqwest::Client,
    url: &str,
    tmp: &Path,
    approx_total: u64,
    bounds: DownloadBounds,
    cancel: &CancelFlag,
    on_progress: &mut F,
) -> Result<String, StreamDownloadError>
where
    F: FnMut(u64, u64),
{
    let fetch = async {
        let mut response = tokio::select! {
            biased;
            _ = wait_for_cancel(cancel) => return Err(StreamDownloadError::Cancelled),
            result = timeout(bounds.idle_timeout, client.get(url).send()) => result
                .map_err(|_| stalled(bounds.idle_timeout))?
                .map_err(|e| StreamDownloadError::Network(e.to_string()))?
                .error_for_status()
                .map_err(|e| StreamDownloadError::Network(e.to_string()))?,
        };

        let total = response.content_length().unwrap_or(approx_total);
        let mut file = tokio::fs::File::create(tmp)
            .await
            .map_err(|e| StreamDownloadError::Io(e.to_string()))?;
        let mut hasher = Sha256::new();
        let mut downloaded: u64 = 0;

        loop {
            let chunk = tokio::select! {
                biased;
                _ = wait_for_cancel(cancel) => return Err(StreamDownloadError::Cancelled),
                result = timeout(bounds.idle_timeout, response.chunk()) => result
                    .map_err(|_| stalled(bounds.idle_timeout))?
                    .map_err(|e| StreamDownloadError::Network(e.to_string()))?,
            };
            let Some(chunk) = chunk else {
                break;
            };

            downloaded += chunk.len() as u64;
            if downloaded > bounds.oversize_cap {
                return Err(StreamDownloadError::Oversize);
            }

            hasher.update(&chunk);
            file.write_all(&chunk)
                .await
                .map_err(|e| StreamDownloadError::Io(e.to_string()))?;
            on_progress(downloaded, total);
        }

        file.flush()
            .await
            .map_err(|e| StreamDownloadError::Io(e.to_string()))?;
        drop(file);

        Ok(hex::encode(hasher.finalize()))
    };

    match timeout(bounds.overall_timeout, fetch).await {
        Ok(inner) => inner,
        Err(_) => Err(StreamDownloadError::Timeout {
            detail: format!(
                "download exceeded the overall {}s time budget",
                bounds.overall_timeout.as_secs()
            ),
        }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::sha256_hex;
    use std::path::PathBuf;
    use wiremock::matchers::{method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    fn no_cancel() -> CancelFlag {
        Arc::new(AtomicBool::new(false))
    }

    fn bounds(idle_ms: u64, overall_ms: u64, cap: u64) -> DownloadBounds {
        DownloadBounds {
            idle_timeout: Duration::from_millis(idle_ms),
            overall_timeout: Duration::from_millis(overall_ms),
            oversize_cap: cap,
        }
    }

    fn scratch_tmp(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!(
            "ost-generic-dl-{name}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ))
    }

    #[tokio::test]
    async fn streams_and_returns_the_computed_digest() {
        let payload = b"synthetic-gguf-model-bytes-in-chunks".to_vec();
        let expected = sha256_hex(&payload);

        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/model.gguf"))
            .respond_with(ResponseTemplate::new(200).set_body_bytes(payload.clone()))
            .mount(&server)
            .await;

        let client = reqwest::Client::new();
        let tmp = scratch_tmp("ok");
        let mut progress_calls = 0u32;

        let digest = stream_download_to_file(
            &client,
            &format!("{}/model.gguf", server.uri()),
            &tmp,
            payload.len() as u64,
            bounds(5_000, 5_000, (payload.len() as u64) * 2),
            &no_cancel(),
            &mut |_d, _t| progress_calls += 1,
        )
        .await
        .expect("download should succeed");

        assert_eq!(digest, expected, "returned digest must match the source");
        let written = std::fs::read(&tmp).expect("temp file written");
        assert_eq!(written, payload, "streamed bytes must match the source");
        assert!(progress_calls > 0, "progress must be reported");
        let _ = std::fs::remove_file(&tmp);
    }

    #[tokio::test]
    async fn aborts_a_stalled_response_within_the_idle_timeout() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/model.gguf"))
            .respond_with(
                ResponseTemplate::new(200)
                    .set_body_bytes(b"irrelevant".to_vec())
                    .set_delay(Duration::from_millis(300)),
            )
            .mount(&server)
            .await;

        let client = reqwest::Client::new();
        let tmp = scratch_tmp("stalled");
        let started = std::time::Instant::now();
        let result = stream_download_to_file(
            &client,
            &format!("{}/model.gguf", server.uri()),
            &tmp,
            10,
            bounds(50, 5_000, 1_000),
            &no_cancel(),
            &mut |_, _| {},
        )
        .await;

        assert!(matches!(result, Err(StreamDownloadError::Timeout { .. })));
        assert!(started.elapsed() < Duration::from_millis(300));
    }

    #[tokio::test]
    async fn aborts_when_the_overall_timeout_elapses() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/model.gguf"))
            .respond_with(
                ResponseTemplate::new(200)
                    .set_body_bytes(b"irrelevant".to_vec())
                    .set_delay(Duration::from_millis(200)),
            )
            .mount(&server)
            .await;

        let client = reqwest::Client::new();
        let tmp = scratch_tmp("overall");
        let result = stream_download_to_file(
            &client,
            &format!("{}/model.gguf", server.uri()),
            &tmp,
            10,
            bounds(5_000, 50, 1_000),
            &no_cancel(),
            &mut |_, _| {},
        )
        .await;

        assert!(matches!(result, Err(StreamDownloadError::Timeout { .. })));
    }

    #[tokio::test]
    async fn aborts_a_transfer_that_exceeds_the_oversize_cap() {
        let payload = vec![0u8; 4096];
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/model.gguf"))
            .respond_with(ResponseTemplate::new(200).set_body_bytes(payload))
            .mount(&server)
            .await;

        let client = reqwest::Client::new();
        let tmp = scratch_tmp("oversize");
        let result = stream_download_to_file(
            &client,
            &format!("{}/model.gguf", server.uri()),
            &tmp,
            10,
            bounds(5_000, 5_000, 100),
            &no_cancel(),
            &mut |_, _| {},
        )
        .await;

        assert!(matches!(result, Err(StreamDownloadError::Oversize)));
        let _ = std::fs::remove_file(&tmp);
    }

    #[tokio::test]
    async fn aborts_cleanly_when_cancelled_mid_stream() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/model.gguf"))
            .respond_with(
                ResponseTemplate::new(200)
                    .set_body_bytes(b"irrelevant-partial-bytes".to_vec())
                    .set_delay(Duration::from_secs(5)),
            )
            .mount(&server)
            .await;

        let client = reqwest::Client::new();
        let tmp = scratch_tmp("cancelled");
        let cancel: CancelFlag = Arc::new(AtomicBool::new(false));
        let setter = Arc::clone(&cancel);
        tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(50)).await;
            setter.store(true, Ordering::SeqCst);
        });

        let started = std::time::Instant::now();
        let result = stream_download_to_file(
            &client,
            &format!("{}/model.gguf", server.uri()),
            &tmp,
            10,
            bounds(30_000, 30_000, 1_000),
            &cancel,
            &mut |_, _| {},
        )
        .await;

        assert!(matches!(result, Err(StreamDownloadError::Cancelled)));
        assert!(started.elapsed() < Duration::from_secs(5));
    }

    #[tokio::test]
    async fn http_error_status_maps_to_network() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/model.gguf"))
            .respond_with(ResponseTemplate::new(404))
            .mount(&server)
            .await;

        let client = reqwest::Client::new();
        let tmp = scratch_tmp("404");
        let result = stream_download_to_file(
            &client,
            &format!("{}/model.gguf", server.uri()),
            &tmp,
            10,
            bounds(5_000, 5_000, 1_000),
            &no_cancel(),
            &mut |_, _| {},
        )
        .await;

        assert!(matches!(result, Err(StreamDownloadError::Network(_))));
    }
}
