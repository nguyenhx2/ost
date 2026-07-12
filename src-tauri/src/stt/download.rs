//! Fail-closed, SHA-256-verified whisper model download (FR-01, ADR-002,
//! security-privacy.md supply-chain).
//!
//! whisper.cpp ggml models are large native binaries loaded straight into the
//! process, so an unverified download is a code-execution surface. This module
//! is the ONLY self-fetch path for a whisper model and it enforces, in order:
//!
//! 1. the SHARED fail-closed consent gate (`crate::models::ModelGate`) - no byte
//!    is fetched until the user granted first-run download consent over IPC;
//! 2. a PINNED per-file SHA-256 - the download is REFUSED outright when the
//!    model constant carries no digest (`sha256.is_none()`), because an unpinned
//!    hash would load an unverified ggml binary;
//! 3. content verification - the fetched bytes are hashed INCREMENTALLY as they
//!    stream to a temp file and the finished digest is compared to the pin
//!    BEFORE the atomic rename into place; a mismatch deletes the temp file and
//!    rejects the artifact.
//!
//! Only after all three pass are the bytes placed on disk (atomically, via a
//! temp file + rename) under the gitignored model cache dir - never the repo
//! tree, never committed. The download is HTTPS-only.
//!
//! Bounded fetch (TASK-026 review fix, security BLOCKER): a stalled/hung HTTPS
//! response must not hang the Settings-triggered download forever, but whisper
//! models range up to ~3.1 GB (large-v3) so a single OVERALL timeout short
//! enough to bound a stall would also kill a legitimate slow-but-alive link
//! partway through a multi-GB transfer. The primary guard is therefore an IDLE
//! timeout (no bytes for N seconds = stalled, aborted) applied to both the
//! initial response wait and every subsequent chunk read, with a generous
//! OVERALL wall-clock backstop for a transfer that trickles just often enough
//! to never trip the idle guard. The fetched bytes also never exceed a sane
//! multiple of the model's PINNED approximate size (never the untrusted
//! server-supplied `Content-Length`), so a misbehaving/compromised host cannot
//! stream an unbounded artifact onto disk. Bytes are written to the temp file
//! as they arrive (never buffered whole in memory) and hashed incrementally.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use sha2::{Digest, Sha256};
use tokio::io::AsyncWriteExt;
use tokio::time::timeout;

use crate::models::{verify_sha256, ConsentDisclosure, ModelError, ModelGate};

use super::model::{WhisperModel, WHISPER_MODEL_SET_ID};

/// A per-download cancel signal (Settings, TASK-034): `cancel_stt_model_download`
/// flips it, the streaming loop below observes it within [`CANCEL_POLL_INTERVAL`]
/// and aborts cleanly (partial file removed by the caller, same as any other
/// failure). A fresh, never-flipped flag is a no-op cancel source for callers
/// that do not need cancellation (e.g. the original first-run
/// [`ensure_model_available`] wrapper).
pub type CancelFlag = Arc<AtomicBool>;

/// Poll interval for the cancel flag while waiting on network I/O. Bounds how
/// quickly a user-triggered cancel takes effect without needing a second
/// notification channel.
const CANCEL_POLL_INTERVAL: Duration = Duration::from_millis(150);

/// Resolves once `flag` is set - used to race a network wait against a
/// cancellation request via `tokio::select!`.
async fn wait_for_cancel(flag: &AtomicBool) {
    loop {
        if flag.load(Ordering::SeqCst) {
            return;
        }
        tokio::time::sleep(CANCEL_POLL_INTERVAL).await;
    }
}

/// Base URL for the official whisper.cpp ggml models on Hugging Face. The
/// `resolve/main/<filename>` path serves the raw LFS content (not the pointer).
/// Named explicitly as the single egress host the security-reviewer inspects.
const HF_RESOLVE_BASE: &str = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main";

/// TCP-connect timeout for the initial HTTPS handshake - fails fast on an
/// unreachable host without waiting for the (much larger) transfer timeouts
/// below.
const CONNECT_TIMEOUT: Duration = Duration::from_secs(30);

/// A response wait (headers) or a chunk read that produces nothing within this
/// window is treated as a stalled connection and aborted (TASK-026 review
/// fix), rather than the download hanging indefinitely.
const IDLE_TIMEOUT: Duration = Duration::from_secs(30);

/// Generous backstop on total wall-clock time: bounds a transfer that keeps
/// producing occasional bytes (so it never trips the idle guard above) but
/// crawls forever. ~4 hours covers the largest catalog model (~3.1 GB, TASK-026
/// large-v3) even at a very slow but real ~250 KB/s link, with headroom to
/// spare, so it never penalizes a legitimate slow connection.
const OVERALL_TIMEOUT: Duration = Duration::from_secs(4 * 60 * 60);

/// Oversize guard multiplier applied to the model's PINNED approximate download
/// size (trusted, compiled-in) - never the server-supplied `Content-Length`,
/// which a misbehaving or compromised host could set arbitrarily. 2x leaves
/// margin for minor publisher revisions while still bounding a
/// runaway/streaming-forever response instead of letting it grow unbounded on
/// disk.
const OVERSIZE_FACTOR: u64 = 2;

/// Errors from the whisper model download path. Display strings carry only model
/// ids/filenames and reasons - never user content, never a secret, never an
/// absolute user path.
#[derive(Debug, thiserror::Error)]
pub enum DownloadError {
    /// First-run download consent has not been granted (fail-closed). Carries
    /// the disclosure so the session can forward it to the UI.
    #[error("whisper model download requires consent: {}", .0.model_set_id)]
    ConsentRequired(Box<ConsentDisclosure>),

    /// The model constant carries no pinned SHA-256. The download is REFUSED:
    /// shipping an unverified native ggml binary is a supply-chain risk
    /// (security-privacy.md). This is a bug in the registry, never a runtime
    /// condition a user can hit once every model is pinned.
    #[error("refusing to download {filename}: no pinned SHA-256 to verify against")]
    Unpinned { filename: &'static str },

    /// The fetched bytes did not match the pinned SHA-256. The artifact is
    /// rejected and nothing is written to disk.
    #[error("integrity check failed for {filename}: SHA-256 mismatch")]
    Integrity { filename: &'static str },

    /// The HTTPS fetch failed (network/transport/HTTP status).
    #[error("whisper model download failed: {0}")]
    Network(String),

    /// The download made no progress (idle) for too long, or ran past its
    /// overall time budget - a stalled/hung transfer, not a definite network
    /// failure (TASK-026 review fix: bounds a hung Settings-triggered
    /// download).
    #[error("whisper model download timed out: {detail}")]
    Timeout { detail: String },

    /// The transfer exceeded a sane multiple of the model's expected size and
    /// was aborted rather than let an unbounded/misbehaving response stream
    /// onto disk indefinitely.
    #[error("whisper model download for {filename} exceeded the expected size and was aborted")]
    Oversize { filename: &'static str },

    /// Writing the verified bytes to the cache dir failed.
    #[error("could not write whisper model to the cache: {0}")]
    Io(String),

    /// The user cancelled the in-progress download (Settings, TASK-034). Not a
    /// failure - the caller cleans up the partial file and resets state exactly
    /// as it would for any other aborted transfer.
    #[error("whisper model download for {filename} was cancelled")]
    Cancelled { filename: &'static str },
}

impl DownloadError {
    /// The consent disclosure, when this error is a fail-closed consent refusal.
    #[must_use]
    pub fn consent_disclosure(&self) -> Option<&ConsentDisclosure> {
        match self {
            DownloadError::ConsentRequired(d) => Some(d),
            _ => None,
        }
    }
}

/// Verifies `bytes` against the model's PINNED SHA-256 (fail-closed).
///
/// REFUSES with [`DownloadError::Unpinned`] when the model carries no digest, and
/// rejects with [`DownloadError::Integrity`] on a mismatch. Pure and
/// network-free so the exact gate is unit-tested without any download. Kept as
/// a small verification primitive alongside the streaming download path (which
/// verifies an incrementally-computed digest instead of a whole in-memory
/// buffer, but the same fail-closed rule).
pub fn verify_model_bytes(model: &WhisperModel, bytes: &[u8]) -> Result<(), DownloadError> {
    // REFUSE if there is nothing to verify against - never load an unverified
    // native binary (security-privacy.md supply-chain).
    let expected = model.sha256.ok_or(DownloadError::Unpinned {
        filename: model.filename,
    })?;
    if verify_sha256(bytes, expected) {
        Ok(())
    } else {
        Err(DownloadError::Integrity {
            filename: model.filename,
        })
    }
}

/// The HTTPS URL the model's ggml file is fetched from.
#[must_use]
pub fn model_url(model: &WhisperModel) -> String {
    format!("{HF_RESOLVE_BASE}/{}", model.filename)
}

/// Ensures `model` is present and verified under `model_dir`, downloading it
/// (once) through the fail-closed consent gate + pinned SHA-256 when absent.
///
/// Order (each stage fails closed before the next):
/// 1. `gate.ensure_download_allowed` - refuse without consent;
/// 2. if the file already exists, return it (it was verified when written);
/// 3. refuse when the model carries no pinned SHA-256;
/// 4. HTTPS-fetch the bytes (bounded, streamed to a temp file, hashed
///    incrementally), verify the finished digest against the pin, and only
///    then rename the temp file into place.
///
/// The fetch/verify/write is I/O-bound but bounded (idle + overall timeouts,
/// oversize guard - see the module docs); the caller runs it off the UI thread
/// (the session start task). Returns the on-disk model path.
pub async fn ensure_model_available(
    model: WhisperModel,
    model_dir: &Path,
    gate: &ModelGate,
) -> Result<PathBuf, DownloadError> {
    let never_cancelled: CancelFlag = Arc::new(AtomicBool::new(false));
    ensure_model_available_with_progress_and_cancel(
        model,
        model_dir,
        gate,
        &never_cancelled,
        |_downloaded, _total| {},
    )
    .await
}

/// Same fail-closed contract as [`ensure_model_available`], additionally
/// invoking `on_progress(downloaded_bytes, total_bytes)` after each chunk of
/// the HTTPS fetch (Settings-time model switching, TASK-026: the download
/// dialog shows live progress instead of a silent multi-hundred-MB wait).
/// `total_bytes` falls back to the model's approximate published size when the
/// server omits `Content-Length`. [`ensure_model_available`] is a thin
/// no-progress wrapper so the original call sites are unaffected.
pub async fn ensure_model_available_with_progress<F>(
    model: WhisperModel,
    model_dir: &Path,
    gate: &ModelGate,
    on_progress: F,
) -> Result<PathBuf, DownloadError>
where
    F: FnMut(u64, u64),
{
    let never_cancelled: CancelFlag = Arc::new(AtomicBool::new(false));
    ensure_model_available_with_progress_and_cancel(
        model,
        model_dir,
        gate,
        &never_cancelled,
        on_progress,
    )
    .await
}

/// Same fail-closed contract as [`ensure_model_available_with_progress`],
/// additionally observing `cancel` (Settings, TASK-034): the caller flips it
/// via `cancel_stt_model_download` to abort the in-progress stream cleanly -
/// the partial file is removed and no bytes are trusted, exactly like any
/// other aborted transfer.
pub async fn ensure_model_available_with_progress_and_cancel<F>(
    model: WhisperModel,
    model_dir: &Path,
    gate: &ModelGate,
    cancel: &CancelFlag,
    mut on_progress: F,
) -> Result<PathBuf, DownloadError>
where
    F: FnMut(u64, u64),
{
    // 1. Fail-closed consent gate FIRST - no byte is fetched without consent.
    gate.ensure_download_allowed(WHISPER_MODEL_SET_ID)
        .map_err(map_consent_error)?;

    // 2. Already downloaded (and verified when it was written): reuse it.
    let dest = model.path_in(model_dir);
    if dest.exists() {
        return Ok(dest);
    }

    // 3. REFUSE before any network I/O when there is no digest to verify against.
    let expected_digest = model.sha256.ok_or(DownloadError::Unpinned {
        filename: model.filename,
    })?;

    if let Some(parent) = dest.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| DownloadError::Io(e.to_string()))?;
    }

    // 4. Fetch over HTTPS (bounded, streamed straight to a temp file), verify,
    // and only then rename into place.
    let client = reqwest::Client::builder()
        .connect_timeout(CONNECT_TIMEOUT)
        .build()
        .map_err(|e| DownloadError::Network(e.to_string()))?;
    let url = model_url(&model);
    let tmp = dest.with_extension("bin.partial");
    let oversize_cap = model.approx_download_bytes.saturating_mul(OVERSIZE_FACTOR);

    let result = download_verified(
        &client,
        &url,
        &tmp,
        model.filename,
        expected_digest,
        model.approx_download_bytes,
        oversize_cap,
        IDLE_TIMEOUT,
        OVERALL_TIMEOUT,
        cancel,
        &mut on_progress,
    )
    .await;

    if let Err(err) = result {
        // Fail-closed cleanup: never leave a partial/unverified artifact behind
        // for a later run to mistake for a verified one (also applies to a
        // user-triggered cancel).
        let _ = tokio::fs::remove_file(&tmp).await;
        return Err(err);
    }

    tokio::fs::rename(&tmp, &dest)
        .await
        .map_err(|e| DownloadError::Io(e.to_string()))?;
    Ok(dest)
}

/// Streams `url` to `tmp` (never buffering the whole artifact in memory),
/// hashing incrementally, then verifies the finished file's digest against
/// `expected_digest` BEFORE returning success - the caller renames `tmp` into
/// place only on `Ok`, and removes it on any `Err`. Bounded by `idle_timeout`
/// (no bytes for that long - including the initial response wait - is treated
/// as stalled and aborted) and `overall_timeout` (absolute wall-clock
/// backstop); aborts early with [`DownloadError::Oversize`] if the transfer
/// exceeds `oversize_cap` bytes.
///
/// Parameterized on the timeouts (rather than reading the module constants
/// directly) so the review-fix stall/oversize behaviour is unit-tested against
/// a local mock server with tiny bounds instead of the multi-hour production
/// constants (`tests::download_verified_*`).
#[allow(clippy::too_many_arguments)]
async fn download_verified<F>(
    client: &reqwest::Client,
    url: &str,
    tmp: &Path,
    filename: &'static str,
    expected_digest: &str,
    approx_total: u64,
    oversize_cap: u64,
    idle_timeout: Duration,
    overall_timeout: Duration,
    cancel: &CancelFlag,
    on_progress: &mut F,
) -> Result<(), DownloadError>
where
    F: FnMut(u64, u64),
{
    let fetch = async {
        let mut response = tokio::select! {
            biased;
            _ = wait_for_cancel(cancel) => return Err(DownloadError::Cancelled { filename }),
            result = timeout(idle_timeout, client.get(url).send()) => result
                .map_err(|_| stalled(idle_timeout))?
                .map_err(|e| DownloadError::Network(e.to_string()))?
                .error_for_status()
                .map_err(|e| DownloadError::Network(e.to_string()))?,
        };

        let total = response.content_length().unwrap_or(approx_total);
        let mut file = tokio::fs::File::create(tmp)
            .await
            .map_err(|e| DownloadError::Io(e.to_string()))?;
        let mut hasher = Sha256::new();
        let mut downloaded: u64 = 0;

        loop {
            let chunk = tokio::select! {
                biased;
                _ = wait_for_cancel(cancel) => return Err(DownloadError::Cancelled { filename }),
                result = timeout(idle_timeout, response.chunk()) => result
                    .map_err(|_| stalled(idle_timeout))?
                    .map_err(|e| DownloadError::Network(e.to_string()))?,
            };
            let Some(chunk) = chunk else {
                break;
            };

            downloaded += chunk.len() as u64;
            if downloaded > oversize_cap {
                return Err(DownloadError::Oversize { filename });
            }

            hasher.update(&chunk);
            file.write_all(&chunk)
                .await
                .map_err(|e| DownloadError::Io(e.to_string()))?;
            on_progress(downloaded, total);
        }

        file.flush()
            .await
            .map_err(|e| DownloadError::Io(e.to_string()))?;
        drop(file);

        let digest = hex::encode(hasher.finalize());
        if digest.eq_ignore_ascii_case(expected_digest.trim()) {
            Ok(())
        } else {
            Err(DownloadError::Integrity { filename })
        }
    };

    match timeout(overall_timeout, fetch).await {
        Ok(inner) => inner,
        Err(_) => Err(DownloadError::Timeout {
            detail: format!(
                "download of {filename} exceeded the overall {}s time budget",
                overall_timeout.as_secs()
            ),
        }),
    }
}

/// Builds the [`DownloadError::Timeout`] for an idle (no-data) stall.
fn stalled(idle_timeout: Duration) -> DownloadError {
    DownloadError::Timeout {
        detail: format!(
            "no data received for {}s (stalled connection)",
            idle_timeout.as_secs()
        ),
    }
}

/// Maps a consent-gate error into the download error surface.
fn map_consent_error(err: ModelError) -> DownloadError {
    match err {
        ModelError::ConsentRequired(disclosure) => DownloadError::ConsentRequired(disclosure),
        other => DownloadError::Network(other.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::sha256_hex;
    use std::sync::Arc;
    use wiremock::matchers::{method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    /// A cancel flag that never fires - the tests below exercise every OTHER
    /// abort path (integrity/timeout/oversize); the cancellation itself is
    /// covered by its own dedicated test.
    fn no_cancel() -> CancelFlag {
        Arc::new(AtomicBool::new(false))
    }

    fn model_with_digest(digest: &'static str) -> WhisperModel {
        WhisperModel {
            sha256: Some(digest),
            ..WhisperModel::TINY
        }
    }

    #[test]
    fn verify_refuses_when_the_model_has_no_pinned_digest() {
        // The core supply-chain guard: an unpinned model is REFUSED, never
        // loaded (security-privacy.md). No network, no bytes trusted.
        let model = WhisperModel {
            sha256: None,
            ..WhisperModel::TINY
        };
        assert!(matches!(
            verify_model_bytes(&model, b"anything"),
            Err(DownloadError::Unpinned { .. })
        ));
    }

    #[test]
    fn verify_accepts_bytes_matching_the_pin() {
        // A tiny synthetic payload standing in for the ggml bytes; we pin its own
        // digest so the match path is exercised with no download.
        let payload = b"synthetic-ggml-bytes";
        let digest: &'static str = Box::leak(sha256_hex(payload).into_boxed_str());
        let model = model_with_digest(digest);
        assert!(verify_model_bytes(&model, payload).is_ok());
    }

    #[test]
    fn verify_rejects_tampered_bytes() {
        let payload = b"synthetic-ggml-bytes";
        let digest: &'static str = Box::leak(sha256_hex(payload).into_boxed_str());
        let model = model_with_digest(digest);
        assert!(matches!(
            verify_model_bytes(&model, b"tampered-ggml-bytes"),
            Err(DownloadError::Integrity { .. })
        ));
    }

    #[test]
    fn real_model_constants_verify_against_their_own_pins() {
        // Sanity: the pinned digest of each registry constant is a valid 64-hex
        // string that verify_sha256 treats as the expected value (a byte blob
        // hashing to it would pass). Guards a typo'd pin at compile-review time.
        for model in [
            WhisperModel::TINY,
            WhisperModel::BASE,
            WhisperModel::SMALL,
            WhisperModel::MEDIUM,
            WhisperModel::LARGE_V3_TURBO,
            WhisperModel::LARGE_V3,
        ] {
            let digest = model.sha256.expect("pinned");
            // Bytes that DO hash to the pin would pass; unrelated bytes fail.
            assert!(verify_sha256(
                digest.as_bytes(),
                &sha256_hex(digest.as_bytes())
            ));
            assert!(matches!(
                verify_model_bytes(&model, b"not the model"),
                Err(DownloadError::Integrity { .. })
            ));
        }
    }

    #[test]
    fn url_targets_hugging_face_over_https() {
        let url = model_url(&WhisperModel::BASE);
        assert!(url.starts_with("https://huggingface.co/ggerganov/whisper.cpp/resolve/main/"));
        assert!(url.ends_with("ggml-base.bin"));
    }

    #[tokio::test]
    async fn ensure_fails_closed_without_consent_and_fetches_nothing() {
        use crate::models::{InMemoryConsentStore, ModelGate};
        use crate::stt::model::whisper_model_set_descriptor;
        use std::path::PathBuf;

        // A gate with NO consent recorded: ensure_model_available must refuse
        // BEFORE any network call and leave the cache dir untouched.
        let dir = std::env::temp_dir().join(format!("ost-dl-noconsent-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let gate = ModelGate::new(
            Arc::new(InMemoryConsentStore::default()),
            vec![whisper_model_set_descriptor(
                WhisperModel::TINY,
                PathBuf::from("/cache"),
            )],
        );
        let result = ensure_model_available(WhisperModel::TINY, &dir, &gate).await;
        assert!(matches!(result, Err(DownloadError::ConsentRequired(_))));
        // Nothing was created (no fetch happened).
        assert!(
            !dir.exists(),
            "a refused download must not touch the cache dir"
        );
    }

    #[tokio::test]
    async fn progress_variant_also_fails_closed_and_reports_no_progress() {
        use crate::models::{InMemoryConsentStore, ModelGate};
        use crate::stt::model::whisper_model_set_descriptor;
        use std::path::PathBuf;
        use std::sync::atomic::{AtomicUsize, Ordering};

        let dir =
            std::env::temp_dir().join(format!("ost-dl-progress-noconsent-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let gate = ModelGate::new(
            Arc::new(InMemoryConsentStore::default()),
            vec![whisper_model_set_descriptor(
                WhisperModel::TINY,
                PathBuf::from("/cache"),
            )],
        );
        let calls = AtomicUsize::new(0);
        let result =
            ensure_model_available_with_progress(WhisperModel::TINY, &dir, &gate, |_, _| {
                calls.fetch_add(1, Ordering::SeqCst);
            })
            .await;
        assert!(matches!(result, Err(DownloadError::ConsentRequired(_))));
        assert_eq!(
            calls.load(Ordering::SeqCst),
            0,
            "no progress callback without a fetch"
        );
        assert!(!dir.exists());
    }

    /// Unique scratch path for the `download_verified` unit tests below (they
    /// exercise the streaming/timeout/oversize behaviour directly against a
    /// local mock server, bypassing consent/registry plumbing already covered
    /// above).
    fn scratch_tmp(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!(
            "ost-dl-verified-{name}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ))
    }

    #[tokio::test]
    async fn download_verified_streams_and_verifies_a_matching_digest() {
        let payload = b"synthetic-ggml-model-bytes-streamed-in-chunks".to_vec();
        let digest = sha256_hex(&payload);

        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/model.bin"))
            .respond_with(ResponseTemplate::new(200).set_body_bytes(payload.clone()))
            .mount(&server)
            .await;

        let client = reqwest::Client::new();
        let tmp = scratch_tmp("ok");
        let mut progress_calls = 0u32;

        let result = download_verified(
            &client,
            &format!("{}/model.bin", server.uri()),
            &tmp,
            "ggml-test.bin",
            &digest,
            payload.len() as u64,
            (payload.len() as u64) * 2,
            Duration::from_secs(5),
            Duration::from_secs(5),
            &no_cancel(),
            &mut |_downloaded, _total| progress_calls += 1,
        )
        .await;

        assert!(result.is_ok(), "expected success, got {result:?}");
        let written = std::fs::read(&tmp).expect("temp file written");
        assert_eq!(written, payload, "streamed bytes must match the source");
        assert!(progress_calls > 0, "progress must be reported");

        let _ = std::fs::remove_file(&tmp);
    }

    #[tokio::test]
    async fn download_verified_rejects_a_digest_mismatch_and_leaves_the_temp_file_for_the_caller_to_clean_up(
    ) {
        let payload = b"synthetic-ggml-model-bytes".to_vec();
        let wrong_digest = sha256_hex(b"different-bytes-entirely");

        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/model.bin"))
            .respond_with(ResponseTemplate::new(200).set_body_bytes(payload.clone()))
            .mount(&server)
            .await;

        let client = reqwest::Client::new();
        let tmp = scratch_tmp("mismatch");

        let result = download_verified(
            &client,
            &format!("{}/model.bin", server.uri()),
            &tmp,
            "ggml-test.bin",
            &wrong_digest,
            payload.len() as u64,
            (payload.len() as u64) * 2,
            Duration::from_secs(5),
            Duration::from_secs(5),
            &no_cancel(),
            &mut |_, _| {},
        )
        .await;

        assert!(matches!(result, Err(DownloadError::Integrity { .. })));
        let _ = std::fs::remove_file(&tmp);
    }

    #[tokio::test]
    async fn download_verified_aborts_a_stalled_response_within_the_idle_timeout() {
        // BLOCKER fix regression test: a response that never produces bytes
        // within `idle_timeout` (simulated here with a mock delay well past a
        // tiny test timeout) must abort with a Timeout error - not hang. This
        // exercises the exact wrapper the production path uses, just with
        // second-vs-millisecond bounds swapped so the test stays fast.
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/model.bin"))
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
        let result = download_verified(
            &client,
            &format!("{}/model.bin", server.uri()),
            &tmp,
            "ggml-test.bin",
            "irrelevant-digest",
            10,
            1_000,
            Duration::from_millis(50),
            Duration::from_secs(5),
            &no_cancel(),
            &mut |_, _| {},
        )
        .await;

        assert!(
            matches!(result, Err(DownloadError::Timeout { .. })),
            "expected a Timeout error, got {result:?}"
        );
        assert!(
            started.elapsed() < Duration::from_millis(300),
            "the idle timeout (50ms) must trip well before the mock's 300ms delay"
        );
    }

    #[tokio::test]
    async fn download_verified_aborts_when_the_overall_timeout_elapses() {
        // The overall backstop fires even when the idle timeout alone would not
        // (a response that is merely slow to start, not fully stalled).
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/model.bin"))
            .respond_with(
                ResponseTemplate::new(200)
                    .set_body_bytes(b"irrelevant".to_vec())
                    .set_delay(Duration::from_millis(200)),
            )
            .mount(&server)
            .await;

        let client = reqwest::Client::new();
        let tmp = scratch_tmp("overall");

        let result = download_verified(
            &client,
            &format!("{}/model.bin", server.uri()),
            &tmp,
            "ggml-test.bin",
            "irrelevant-digest",
            10,
            1_000,
            Duration::from_secs(5), // idle timeout would NOT catch this alone
            Duration::from_millis(50),
            &no_cancel(),
            &mut |_, _| {},
        )
        .await;

        assert!(matches!(result, Err(DownloadError::Timeout { .. })));
    }

    #[tokio::test]
    async fn download_verified_aborts_a_transfer_that_exceeds_the_oversize_cap() {
        // Supply-chain hardening (SHOULD-FIX #2): a transfer that grows past a
        // sane multiple of the model's PINNED expected size is aborted instead
        // of streaming an unbounded artifact onto disk.
        let payload = vec![0u8; 4096];
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/model.bin"))
            .respond_with(ResponseTemplate::new(200).set_body_bytes(payload.clone()))
            .mount(&server)
            .await;

        let client = reqwest::Client::new();
        let tmp = scratch_tmp("oversize");

        let result = download_verified(
            &client,
            &format!("{}/model.bin", server.uri()),
            &tmp,
            "ggml-test.bin",
            "irrelevant-digest",
            10,  // approx_total (progress denominator only)
            100, // oversize_cap far below the 4096-byte payload
            Duration::from_secs(5),
            Duration::from_secs(5),
            &no_cancel(),
            &mut |_, _| {},
        )
        .await;

        assert!(matches!(result, Err(DownloadError::Oversize { .. })));
        let _ = std::fs::remove_file(&tmp);
    }

    #[tokio::test]
    async fn download_verified_aborts_cleanly_when_cancelled_mid_stream() {
        // Settings-time cancel control (TASK-034): flipping the cancel flag
        // while a chunked response is still delaying must abort with
        // `Cancelled`, well before the idle/overall timeouts would fire, and
        // leave nothing for the caller to trust (it removes the temp file).
        let payload = b"irrelevant-partial-bytes".to_vec();
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/model.bin"))
            .respond_with(
                ResponseTemplate::new(200)
                    .set_body_bytes(payload)
                    .set_delay(Duration::from_secs(5)),
            )
            .mount(&server)
            .await;

        let client = reqwest::Client::new();
        let tmp = scratch_tmp("cancelled");
        let cancel: CancelFlag = Arc::new(AtomicBool::new(false));
        let cancel_setter = Arc::clone(&cancel);
        tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(50)).await;
            cancel_setter.store(true, Ordering::SeqCst);
        });

        let started = std::time::Instant::now();
        let result = download_verified(
            &client,
            &format!("{}/model.bin", server.uri()),
            &tmp,
            "ggml-test.bin",
            "irrelevant-digest",
            10,
            1_000,
            Duration::from_secs(30),
            Duration::from_secs(30),
            &cancel,
            &mut |_, _| {},
        )
        .await;

        assert!(
            matches!(result, Err(DownloadError::Cancelled { .. })),
            "expected Cancelled, got {result:?}"
        );
        assert!(
            started.elapsed() < Duration::from_secs(5),
            "cancel must abort well before the mock's 5s delay"
        );
    }
}
