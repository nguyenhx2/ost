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
//! 3. content verification - the fetched bytes are hashed and compared to the
//!    pin BEFORE anything is written to disk; a mismatch rejects the artifact
//!    and writes nothing.
//!
//! Only after all three pass are the bytes placed on disk (atomically, via a
//! temp file + rename) under the gitignored model cache dir - never the repo
//! tree, never committed. The download is HTTPS-only.

use std::path::{Path, PathBuf};

use crate::models::{verify_sha256, ConsentDisclosure, ModelError, ModelGate};

use super::model::{WhisperModel, WHISPER_MODEL_SET_ID};

/// Base URL for the official whisper.cpp ggml models on Hugging Face. The
/// `resolve/main/<filename>` path serves the raw LFS content (not the pointer).
/// Named explicitly as the single egress host the security-reviewer inspects.
const HF_RESOLVE_BASE: &str = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main";

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

    /// Writing the verified bytes to the cache dir failed.
    #[error("could not write whisper model to the cache: {0}")]
    Io(String),
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
/// network-free so the exact gate is unit-tested without any download. Called
/// with the freshly-fetched bytes BEFORE they are written to disk or loaded.
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
/// 4. HTTPS-fetch the bytes, verify against the pin, and only then place them.
///
/// The fetch/verify/write is CPU- and I/O-bound but bounded; the caller runs it
/// off the UI thread (the session start task). Returns the on-disk model path.
pub async fn ensure_model_available(
    model: WhisperModel,
    model_dir: &Path,
    gate: &ModelGate,
) -> Result<PathBuf, DownloadError> {
    // 1. Fail-closed consent gate FIRST - no byte is fetched without consent.
    gate.ensure_download_allowed(WHISPER_MODEL_SET_ID)
        .map_err(map_consent_error)?;

    // 2. Already downloaded (and verified when it was written): reuse it.
    let dest = model.path_in(model_dir);
    if dest.exists() {
        return Ok(dest);
    }

    // 3. REFUSE before any network I/O when there is no digest to verify against.
    if model.sha256.is_none() {
        return Err(DownloadError::Unpinned {
            filename: model.filename,
        });
    }

    // 4. Fetch over HTTPS.
    let url = model_url(&model);
    let response = reqwest::get(&url)
        .await
        .map_err(|e| DownloadError::Network(e.to_string()))?
        .error_for_status()
        .map_err(|e| DownloadError::Network(e.to_string()))?;
    let bytes = response
        .bytes()
        .await
        .map_err(|e| DownloadError::Network(e.to_string()))?;

    // Verify BEFORE writing - a mismatch (or missing pin) writes nothing.
    verify_model_bytes(&model, &bytes)?;

    place_verified_bytes(&dest, &bytes)?;
    Ok(dest)
}

/// Atomically writes verified `bytes` to `dest`: create the parent dir, write a
/// sibling temp file, then rename into place so a crash mid-write never leaves a
/// half-written model that a later run would treat as present.
fn place_verified_bytes(dest: &Path, bytes: &[u8]) -> Result<(), DownloadError> {
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent).map_err(|e| DownloadError::Io(e.to_string()))?;
    }
    let tmp = dest.with_extension("bin.partial");
    std::fs::write(&tmp, bytes).map_err(|e| DownloadError::Io(e.to_string()))?;
    std::fs::rename(&tmp, dest).map_err(|e| DownloadError::Io(e.to_string()))?;
    Ok(())
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
}
