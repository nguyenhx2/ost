//! Whisper ggml model registry + the first-run consent descriptor (FR-01,
//! ADR-002, BR-08).
//!
//! whisper.cpp models are distributed as `ggml-<size>.bin` files on Hugging
//! Face. They are LARGE (75 MB - 1.5 GB), downloaded at first run into a
//! user-cache dir (never committed - `.gitignore` `*.bin`), and the download is
//! an egress the user confirms first (security-privacy.md). This module supplies
//! the whisper [`ModelSetDescriptor`] to the SHARED consent facility
//! (`crate::models`) - it does NOT build a second gate.
//!
//! The size the app recommends is chosen by the hardware probe (`super::hardware`,
//! BR-08); the disclosure the user confirms names that recommended model.

use std::path::PathBuf;

use crate::models::{ModelArtifact, ModelHost, ModelSetDescriptor};

/// Consent-persistence + routing key for the whole whisper feature. One grant
/// enables downloading whichever recommended `ggml-*.bin` the user confirms
/// (the host is the same Hugging Face repo for every size). Never a secret.
pub const WHISPER_MODEL_SET_ID: &str = "whisper-ggml";

/// The Hugging Face model host (whisper.cpp ggml models live in
/// `ggerganov/whisper.cpp`). Named explicitly as an egress path the
/// security-reviewer inspects (mirrors `ModelHost::MODELSCOPE`).
pub const HUGGING_FACE: ModelHost = ModelHost {
    name: "Hugging Face",
    domain: "huggingface.co",
};

/// A whisper model size. Ordered smallest -> largest; larger models are more
/// accurate but slower and need more RAM (the trade-off the hardware probe
/// balances against the p95 < 3s latency budget).
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum WhisperModelSize {
    /// ~75 MB download, ~390 MB RAM. The floor for low-RAM machines.
    Tiny,
    /// ~142 MB download, ~500 MB RAM. The typical default.
    Base,
    /// ~466 MB download, ~1.0 GB RAM. Good accuracy on 8 GB+ machines.
    Small,
    /// ~1.5 GB download, ~2.6 GB RAM. High accuracy; recommended only with GPU
    /// acceleration (Phase 4) - too slow for the CPU latency budget otherwise.
    Medium,
}

/// A downloadable whisper model: its ggml filename, approximate download and
/// resident sizes, and (when pinned) the expected SHA-256 for verification.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct WhisperModel {
    pub size: WhisperModelSize,
    /// The `ggml-<size>.bin` filename in the Hugging Face repo and on disk.
    pub filename: &'static str,
    /// Approximate download size in bytes (publisher's model table); shown in
    /// the consent disclosure so the user sees the download weight.
    pub approx_download_bytes: u64,
    /// Approximate resident memory whisper.cpp uses with this model (README
    /// "Memory usage"); the hardware probe keeps this under available RAM.
    pub approx_ram_bytes: u64,
    /// Expected content SHA-256 for the self-fetch verification path
    /// (`crate::models::verify_sha256`). Pinned to the official per-file digests
    /// from the `ggerganov/whisper.cpp` Hugging Face repo (git-LFS pointer
    /// metadata: `resolve/main/ggml-<size>.bin` `oid sha256:` + matching `size`).
    /// The download step (`super::download`) enforces this on the fetched bytes
    /// BEFORE the ggml file is written or loaded and REFUSES the download when it
    /// is `None` (security-privacy.md supply-chain: an unverified native ggml
    /// binary is a code-exec surface). The consent gate is fail-closed regardless
    /// of this field.
    pub sha256: Option<&'static str>,
}

impl WhisperModel {
    pub const TINY: WhisperModel = WhisperModel {
        size: WhisperModelSize::Tiny,
        filename: "ggml-tiny.bin",
        approx_download_bytes: 77_691_713,
        approx_ram_bytes: 390_000_000,
        sha256: Some("be07e048e1e599ad46341c8d2a135645097a538221678b7acdd1b1919c6e1b21"),
    };
    pub const BASE: WhisperModel = WhisperModel {
        size: WhisperModelSize::Base,
        filename: "ggml-base.bin",
        approx_download_bytes: 147_951_465,
        approx_ram_bytes: 500_000_000,
        sha256: Some("60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe"),
    };
    pub const SMALL: WhisperModel = WhisperModel {
        size: WhisperModelSize::Small,
        filename: "ggml-small.bin",
        approx_download_bytes: 487_601_967,
        approx_ram_bytes: 1_000_000_000,
        sha256: Some("1be3a9b2063867b937e64e2ec7483364a79917e157fa98c5d94b5c1fffea987b"),
    };
    pub const MEDIUM: WhisperModel = WhisperModel {
        size: WhisperModelSize::Medium,
        filename: "ggml-medium.bin",
        approx_download_bytes: 1_533_763_059,
        approx_ram_bytes: 2_600_000_000,
        sha256: Some("6c14d5adee5f86394037b4e4e8b59f1673b6cee10e3cf0b11bbdbee79c156208"),
    };

    /// Resolves a model from its size.
    #[must_use]
    pub fn for_size(size: WhisperModelSize) -> WhisperModel {
        match size {
            WhisperModelSize::Tiny => Self::TINY,
            WhisperModelSize::Base => Self::BASE,
            WhisperModelSize::Small => Self::SMALL,
            WhisperModelSize::Medium => Self::MEDIUM,
        }
    }

    /// The on-disk path of this model under `model_dir`.
    #[must_use]
    pub fn path_in(&self, model_dir: &std::path::Path) -> PathBuf {
        model_dir.join(self.filename)
    }
}

/// Builds the consent disclosure descriptor for the recommended whisper model.
/// Fetched from Hugging Face over HTTPS; `destination` is the resolved model
/// cache dir. Registering the RECOMMENDED model (not every size) keeps the
/// disclosed total size honest - only one model is downloaded.
#[must_use]
pub fn whisper_model_set_descriptor(
    model: WhisperModel,
    destination: PathBuf,
) -> ModelSetDescriptor {
    ModelSetDescriptor {
        id: WHISPER_MODEL_SET_ID,
        display_name: "Local speech-to-text model (whisper.cpp)",
        host: HUGGING_FACE,
        artifacts: vec![ModelArtifact {
            filename: model.filename,
            approx_size_bytes: model.approx_download_bytes,
            sha256: model.sha256,
        }],
        destination,
    }
}

/// Resolves the on-disk whisper model cache dir.
///
/// Precedence: `OST_WHISPER_MODEL_DIR` env var if set, else `<home>/.ost/models`.
/// Never the repo tree - models are gitignored and live in a user cache.
#[must_use]
pub fn resolve_whisper_model_dir() -> PathBuf {
    if let Some(dir) = std::env::var_os("OST_WHISPER_MODEL_DIR") {
        return PathBuf::from(dir);
    }
    home_dir()
        .map(|h| h.join(".ost").join("models"))
        .unwrap_or_else(|| PathBuf::from(".ost").join("models"))
}

/// Best-effort home directory without pulling a new dependency (mirrors
/// `crate::models`' resolver).
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sizes_order_smallest_to_largest() {
        assert!(WhisperModelSize::Tiny < WhisperModelSize::Base);
        assert!(WhisperModelSize::Base < WhisperModelSize::Small);
        assert!(WhisperModelSize::Small < WhisperModelSize::Medium);
    }

    #[test]
    fn for_size_round_trips_the_registry() {
        for size in [
            WhisperModelSize::Tiny,
            WhisperModelSize::Base,
            WhisperModelSize::Small,
            WhisperModelSize::Medium,
        ] {
            assert_eq!(WhisperModel::for_size(size).size, size);
        }
    }

    #[test]
    fn descriptor_names_hugging_face_and_the_recommended_model() {
        let d = whisper_model_set_descriptor(WhisperModel::BASE, PathBuf::from("/cache"));
        assert_eq!(d.id, WHISPER_MODEL_SET_ID);
        assert_eq!(d.host.domain, "huggingface.co");
        // Only the recommended model is disclosed - total size stays honest.
        assert_eq!(d.artifacts.len(), 1);
        assert_eq!(d.artifacts[0].filename, "ggml-base.bin");
        assert_eq!(
            d.total_approx_size_bytes(),
            WhisperModel::BASE.approx_download_bytes
        );
    }

    #[test]
    fn descriptor_disclosure_serializes_the_host_for_ipc() {
        let d = whisper_model_set_descriptor(WhisperModel::SMALL, PathBuf::from("/cache"));
        let disclosure = d.disclosure();
        assert_eq!(disclosure.host_domain, "huggingface.co");
        assert_eq!(disclosure.model_set_id, WHISPER_MODEL_SET_ID);
    }

    #[test]
    fn model_dir_honors_env_override() {
        let prev = std::env::var_os("OST_WHISPER_MODEL_DIR");
        std::env::set_var("OST_WHISPER_MODEL_DIR", "/custom/whisper");
        assert_eq!(
            resolve_whisper_model_dir(),
            PathBuf::from("/custom/whisper")
        );
        match prev {
            Some(v) => std::env::set_var("OST_WHISPER_MODEL_DIR", v),
            None => std::env::remove_var("OST_WHISPER_MODEL_DIR"),
        }
    }

    #[test]
    fn model_path_joins_filename() {
        let p = WhisperModel::TINY.path_in(std::path::Path::new("/cache"));
        assert!(p.ends_with("ggml-tiny.bin"));
    }

    #[test]
    fn every_model_has_a_pinned_sha256_of_the_right_shape() {
        // Hardening (TASK-014 review): every WhisperModel MUST carry a pinned
        // SHA-256 so the download step can verify the fetched ggml bytes and
        // never load an unverified native binary (security-privacy.md). A None
        // here means the fail-closed download would refuse - we require the pin.
        for model in [
            WhisperModel::TINY,
            WhisperModel::BASE,
            WhisperModel::SMALL,
            WhisperModel::MEDIUM,
        ] {
            let digest = model
                .sha256
                .unwrap_or_else(|| panic!("{} must pin a SHA-256", model.filename));
            assert_eq!(
                digest.len(),
                64,
                "{} digest must be 64 hex chars",
                model.filename
            );
            assert!(
                digest.bytes().all(|b| b.is_ascii_hexdigit()),
                "{} digest must be hex",
                model.filename
            );
        }
    }
}
