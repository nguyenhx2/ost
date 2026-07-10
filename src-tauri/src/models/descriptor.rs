//! Model-set descriptors for the shared first-run consent + download facility
//! (TASK-007; whisper STT is the second consumer in Phase 2).
//!
//! A [`ModelSetDescriptor`] is the generic unit the facility reasons about: a
//! named group of model artifacts fetched from ONE named host into ONE
//! destination. It is deliberately engine-agnostic - OCR supplies its PP-OCRv5
//! descriptor (`ocr::paddle`), STT will supply a whisper descriptor - so the
//! consent gate, disclosure, and (future) download logic are written once.
//!
//! The descriptor is ALSO the disclosure surface: the consent request the UI
//! shows names the host, lists the artifacts with their sizes, and states the
//! on-disk destination (security-privacy.md: the download is an egress the user
//! confirms first).

use std::path::PathBuf;

use serde::Serialize;

/// A model download host. `name` is the human label the disclosure shows;
/// `domain` is the exact registry domain (named explicitly, never papered over -
/// security-reviewer reviews this as an egress path).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ModelHost {
    pub name: &'static str,
    pub domain: &'static str,
}

impl ModelHost {
    /// ModelScope - the registry oar-ocr's `auto-download` feature fetches
    /// PP-OCRv5 ONNX models and dictionaries from over HTTPS (ADR-004).
    pub const MODELSCOPE: ModelHost = ModelHost {
        name: "ModelScope",
        domain: "modelscope.cn",
    };
}

/// One downloadable artifact in a model set. `sha256` is the expected content
/// hash when the consumer verifies it itself (whisper); for the OCR consumer the
/// oar-ocr `auto-download` feature performs the SHA-256 verification internally,
/// so this is carried as disclosure metadata and may be `None`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ModelArtifact {
    pub filename: &'static str,
    /// Approximate on-disk size in bytes (from the publisher's model table);
    /// shown in the consent disclosure so the user sees the download weight.
    pub approx_size_bytes: u64,
    pub sha256: Option<&'static str>,
}

/// A named set of model artifacts fetched from one host into one destination.
#[derive(Debug, Clone)]
pub struct ModelSetDescriptor {
    /// Stable id - the consent persistence key and the routing key. Never a
    /// secret (flags/names only, security-privacy.md).
    pub id: &'static str,
    /// Human label for the disclosure (e.g. "Local OCR models (PP-OCRv5)").
    pub display_name: &'static str,
    pub host: ModelHost,
    pub artifacts: Vec<ModelArtifact>,
    /// Where the artifacts are cached on disk.
    pub destination: PathBuf,
}

impl ModelSetDescriptor {
    /// Sum of the artifacts' approximate sizes (disclosure total).
    pub fn total_approx_size_bytes(&self) -> u64 {
        self.artifacts.iter().map(|a| a.approx_size_bytes).sum()
    }

    /// Builds the IPC disclosure the consent request carries. Contains only
    /// names/sizes/paths - never a secret or user content.
    pub fn disclosure(&self) -> ConsentDisclosure {
        ConsentDisclosure {
            model_set_id: self.id.to_string(),
            display_name: self.display_name.to_string(),
            host_name: self.host.name.to_string(),
            host_domain: self.host.domain.to_string(),
            artifacts: self
                .artifacts
                .iter()
                .map(|a| ArtifactDisclosure {
                    filename: a.filename.to_string(),
                    approx_size_bytes: a.approx_size_bytes,
                })
                .collect(),
            total_approx_size_bytes: self.total_approx_size_bytes(),
            destination: self.destination.display().to_string(),
        }
    }
}

/// One artifact row in a [`ConsentDisclosure`].
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArtifactDisclosure {
    pub filename: String,
    pub approx_size_bytes: u64,
}

/// The full disclosure sent to the WebView when consent is required (IPC).
/// Serializes to camelCase to match the TypeScript type; carries the host,
/// artifact list, total size, and destination path so the user makes an
/// informed choice (security-privacy.md user-confirmed-first-run-download).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConsentDisclosure {
    pub model_set_id: String,
    pub display_name: String,
    pub host_name: String,
    pub host_domain: String,
    pub artifacts: Vec<ArtifactDisclosure>,
    pub total_approx_size_bytes: u64,
    pub destination: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn descriptor() -> ModelSetDescriptor {
        ModelSetDescriptor {
            id: "test-set",
            display_name: "Test models",
            host: ModelHost::MODELSCOPE,
            artifacts: vec![
                ModelArtifact {
                    filename: "a.onnx",
                    approx_size_bytes: 1_000,
                    sha256: None,
                },
                ModelArtifact {
                    filename: "b.onnx",
                    approx_size_bytes: 2_500,
                    sha256: None,
                },
            ],
            destination: PathBuf::from("/tmp/models"),
        }
    }

    #[test]
    fn total_size_sums_artifacts() {
        assert_eq!(descriptor().total_approx_size_bytes(), 3_500);
    }

    #[test]
    fn disclosure_names_the_host_and_lists_artifacts() {
        let d = descriptor().disclosure();
        assert_eq!(d.host_name, "ModelScope");
        assert_eq!(d.host_domain, "modelscope.cn");
        assert_eq!(d.artifacts.len(), 2);
        assert_eq!(d.total_approx_size_bytes, 3_500);
        assert_eq!(d.model_set_id, "test-set");
    }

    #[test]
    fn disclosure_serializes_to_camel_case() {
        let value = serde_json::to_value(descriptor().disclosure()).unwrap();
        assert_eq!(value["modelSetId"], "test-set");
        assert_eq!(value["hostDomain"], "modelscope.cn");
        assert_eq!(value["totalApproxSizeBytes"], 3_500);
        assert_eq!(value["artifacts"][0]["approxSizeBytes"], 1_000);
    }
}
