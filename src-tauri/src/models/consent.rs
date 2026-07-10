//! First-run model-download consent gate (fail-closed) + persistence.
//!
//! CORE RULE (security-privacy.md, agent-guardrails.md 5): a model download is
//! REFUSED in Rust until the user grants consent over IPC - never a UI-only
//! gate. [`ModelGate::ensure_download_allowed`] is the single fail-closed check
//! every download-triggering code path must pass through; until consent is
//! recorded it returns [`ModelError::ConsentRequired`] carrying the disclosure,
//! and the caller (OCR pipeline) surfaces it to the UI instead of fetching.
//!
//! Consent is a persisted boolean flag per model-set id (names/flags only, never
//! a secret) and is revocable. Persistence is abstracted behind [`ConsentStore`]
//! so the fail-closed logic is unit-tested with an in-memory store and no
//! network; the production store is backed by tauri-plugin-store.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use serde::Serialize;

use super::descriptor::{ConsentDisclosure, ModelSetDescriptor};

/// Errors from the model facility.
#[derive(Debug, thiserror::Error)]
pub enum ModelError {
    /// The download is blocked because consent has not been granted. Carries the
    /// disclosure (host, sizes, destination) the UI shows to ask for consent.
    #[error("model download requires user consent: {}", .0.model_set_id)]
    ConsentRequired(Box<ConsentDisclosure>),

    /// The model set id is not registered with the gate.
    #[error("unknown model set: {0}")]
    UnknownModelSet(String),

    /// The consent flag could not be read/written from the persisted store.
    #[error("consent persistence error: {0}")]
    Persistence(String),
}

/// Persisted consent flags, keyed by model-set id. Implementations store ONLY
/// booleans keyed by non-secret ids (security-privacy.md). Object-safe so the
/// gate holds `Arc<dyn ConsentStore>` and tests inject a mock.
pub trait ConsentStore: Send + Sync {
    fn is_granted(&self, model_set_id: &str) -> Result<bool, ModelError>;
    fn set_granted(&self, model_set_id: &str, granted: bool) -> Result<(), ModelError>;
}

/// In-memory consent store for tests (no persistence, no network).
#[derive(Debug, Default)]
pub struct InMemoryConsentStore {
    granted: Mutex<HashMap<String, bool>>,
}

impl ConsentStore for InMemoryConsentStore {
    fn is_granted(&self, model_set_id: &str) -> Result<bool, ModelError> {
        Ok(self
            .granted
            .lock()
            .map_err(|_| ModelError::Persistence("in-memory lock poisoned".into()))?
            .get(model_set_id)
            .copied()
            .unwrap_or(false))
    }

    fn set_granted(&self, model_set_id: &str, granted: bool) -> Result<(), ModelError> {
        self.granted
            .lock()
            .map_err(|_| ModelError::Persistence("in-memory lock poisoned".into()))?
            .insert(model_set_id.to_string(), granted);
        Ok(())
    }
}

/// Consent status for one model set (IPC response shape).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelConsentStatus {
    pub model_set_id: String,
    pub granted: bool,
    /// The disclosure the UI shows when asking for (or reviewing) consent.
    pub disclosure: ConsentDisclosure,
}

/// The fail-closed consent gate. Owns the persisted [`ConsentStore`] and the
/// registry of known descriptors so it can build disclosures.
pub struct ModelGate {
    consent: Arc<dyn ConsentStore>,
    registry: Vec<ModelSetDescriptor>,
}

impl ModelGate {
    /// Builds a gate over `consent`, aware of `registry` descriptors.
    pub fn new(consent: Arc<dyn ConsentStore>, registry: Vec<ModelSetDescriptor>) -> Self {
        Self { consent, registry }
    }

    fn descriptor(&self, model_set_id: &str) -> Result<&ModelSetDescriptor, ModelError> {
        self.registry
            .iter()
            .find(|d| d.id == model_set_id)
            .ok_or_else(|| ModelError::UnknownModelSet(model_set_id.to_string()))
    }

    /// FAIL-CLOSED gate: `Ok(())` only when consent is recorded for this model
    /// set; otherwise [`ModelError::ConsentRequired`] with the disclosure. Every
    /// download-triggering path (OCR `build_pipeline`) calls this FIRST.
    pub fn ensure_download_allowed(&self, model_set_id: &str) -> Result<(), ModelError> {
        let descriptor = self.descriptor(model_set_id)?;
        if self.consent.is_granted(model_set_id)? {
            Ok(())
        } else {
            Err(ModelError::ConsentRequired(Box::new(
                descriptor.disclosure(),
            )))
        }
    }

    /// Current consent status + disclosure for a model set (IPC read).
    pub fn status(&self, model_set_id: &str) -> Result<ModelConsentStatus, ModelError> {
        let descriptor = self.descriptor(model_set_id)?;
        Ok(ModelConsentStatus {
            model_set_id: model_set_id.to_string(),
            granted: self.consent.is_granted(model_set_id)?,
            disclosure: descriptor.disclosure(),
        })
    }

    /// Records consent (IPC grant). Idempotent.
    pub fn grant(&self, model_set_id: &str) -> Result<(), ModelError> {
        self.descriptor(model_set_id)?; // reject unknown ids
        self.consent.set_granted(model_set_id, true)
    }

    /// Revokes consent (IPC revoke, Settings). Idempotent; the next download
    /// attempt fails closed again.
    pub fn revoke(&self, model_set_id: &str) -> Result<(), ModelError> {
        self.descriptor(model_set_id)?;
        self.consent.set_granted(model_set_id, false)
    }
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use super::super::descriptor::{ModelArtifact, ModelHost};
    use super::*;

    const SET_ID: &str = "ocr-test-set";

    fn descriptor() -> ModelSetDescriptor {
        ModelSetDescriptor {
            id: SET_ID,
            display_name: "OCR test models",
            host: ModelHost::MODELSCOPE,
            artifacts: vec![ModelArtifact {
                filename: "rec.onnx",
                approx_size_bytes: 7_700_000,
                sha256: None,
            }],
            destination: PathBuf::from("/cache/models"),
        }
    }

    fn gate() -> ModelGate {
        ModelGate::new(
            Arc::new(InMemoryConsentStore::default()),
            vec![descriptor()],
        )
    }

    #[test]
    fn fail_closed_before_consent_is_granted() {
        let gate = gate();
        let err = gate.ensure_download_allowed(SET_ID).unwrap_err();
        match err {
            ModelError::ConsentRequired(disclosure) => {
                // The refusal carries the host + sizes so the UI can disclose.
                assert_eq!(disclosure.host_domain, "modelscope.cn");
                assert_eq!(disclosure.total_approx_size_bytes, 7_700_000);
            }
            other => panic!("expected ConsentRequired, got {other:?}"),
        }
    }

    #[test]
    fn allowed_after_consent_is_granted_and_blocked_again_after_revoke() {
        let gate = gate();
        gate.grant(SET_ID).unwrap();
        assert!(gate.ensure_download_allowed(SET_ID).is_ok());
        assert!(gate.status(SET_ID).unwrap().granted);

        // Revocable (Settings): the next download fails closed again.
        gate.revoke(SET_ID).unwrap();
        assert!(matches!(
            gate.ensure_download_allowed(SET_ID),
            Err(ModelError::ConsentRequired(_))
        ));
        assert!(!gate.status(SET_ID).unwrap().granted);
    }

    #[test]
    fn unknown_model_set_is_rejected() {
        let gate = gate();
        assert!(matches!(
            gate.ensure_download_allowed("nope"),
            Err(ModelError::UnknownModelSet(_))
        ));
        assert!(matches!(
            gate.grant("nope"),
            Err(ModelError::UnknownModelSet(_))
        ));
    }

    #[test]
    fn consent_persists_across_gate_instances_sharing_a_store() {
        // Persistence semantics: a shared store keeps the flag across gates
        // (mirrors process restart with the tauri-plugin-store backend).
        let store: Arc<dyn ConsentStore> = Arc::new(InMemoryConsentStore::default());
        let gate_a = ModelGate::new(Arc::clone(&store), vec![descriptor()]);
        gate_a.grant(SET_ID).unwrap();

        let gate_b = ModelGate::new(store, vec![descriptor()]);
        assert!(gate_b.ensure_download_allowed(SET_ID).is_ok());
    }
}
