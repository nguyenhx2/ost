//! `KeyStore` - the ONLY code path for provider API keys (ADR-003, AC-03.2).
//!
//! Async facade over a synchronous [`KeyBackend`]: every backend call runs in
//! `tokio::task::spawn_blocking` because the `keyring` crate blocks on OS
//! calls (spec lock, NFR-PERF-04).
//!
//! Keychain naming convention (documented in
//! `docs/architecture/api-contracts/providers.md`, keep stable):
//! - service: [`KEYCHAIN_SERVICE`] = `"ost.provider-api-key"`
//! - account: the provider id serde string (`"gemini"`, `"anthropic"`,
//!   `"openai"`, `"openrouter"`).

use std::sync::Arc;

use serde::Serialize;

use super::api_key::ApiKey;
use super::backend::{KeyBackend, KeyringBackend};
use super::error::KeyStoreError;
use crate::providers::ProviderId;

/// Keychain service name for all OST provider keys. Changing this orphans
/// stored credentials - treat as frozen.
pub const KEYCHAIN_SERVICE: &str = "ost.provider-api-key";

/// IPC-facing key status: provider name + masked presence ONLY (AC-03.3,
/// NFR-SEC-02). This is the single type the WebView may ever see about keys.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ProviderKeyStatus {
    pub provider_id: ProviderId,
    pub key_present: bool,
}

/// Async wrapper around the OS keychain. Owns store/retrieve/delete/status.
pub struct KeyStore {
    backend: Arc<dyn KeyBackend>,
}

impl KeyStore {
    /// Production store backed by the OS keychain (Windows Credential Manager).
    pub fn new_os_keychain() -> Self {
        Self::with_backend(Arc::new(KeyringBackend))
    }

    /// Store with an injected backend (tests use an in-memory mock).
    pub fn with_backend(backend: Arc<dyn KeyBackend>) -> Self {
        Self { backend }
    }

    /// Stores (or overwrites) the key for a provider.
    pub async fn store_key(&self, provider: ProviderId, key: ApiKey) -> Result<(), KeyStoreError> {
        let backend = Arc::clone(&self.backend);
        run_blocking(move || backend.set_secret(KEYCHAIN_SERVICE, provider.as_str(), key.expose()))
            .await
    }

    /// Retrieves the key for a provider; `Ok(None)` when not configured.
    /// Callers are inside the Rust core only - the value never crosses IPC.
    pub async fn retrieve_key(
        &self,
        provider: ProviderId,
    ) -> Result<Option<ApiKey>, KeyStoreError> {
        let backend = Arc::clone(&self.backend);
        let value =
            run_blocking(move || backend.get_secret(KEYCHAIN_SERVICE, provider.as_str())).await?;
        match value {
            None => Ok(None),
            Some(raw) => ApiKey::new(raw).map(Some),
        }
    }

    /// Deletes the key for a provider. Idempotent: deleting an absent key
    /// succeeds, and the status flips to not-configured (AC-03.7).
    pub async fn delete_key(&self, provider: ProviderId) -> Result<(), KeyStoreError> {
        let backend = Arc::clone(&self.backend);
        run_blocking(move || backend.delete_secret(KEYCHAIN_SERVICE, provider.as_str())).await
    }

    /// Masked status for one provider - safe for IPC (AC-03.3).
    pub async fn key_status(
        &self,
        provider: ProviderId,
    ) -> Result<ProviderKeyStatus, KeyStoreError> {
        let backend = Arc::clone(&self.backend);
        let present = run_blocking(move || backend.get_secret(KEYCHAIN_SERVICE, provider.as_str()))
            .await?
            .is_some();
        Ok(ProviderKeyStatus {
            provider_id: provider,
            key_present: present,
        })
    }

    /// Masked status for all four providers, in [`ProviderId::ALL`] order.
    pub async fn all_statuses(&self) -> Result<Vec<ProviderKeyStatus>, KeyStoreError> {
        let mut statuses = Vec::with_capacity(ProviderId::ALL.len());
        for provider in ProviderId::ALL {
            statuses.push(self.key_status(provider).await?);
        }
        Ok(statuses)
    }
}

/// Runs a blocking keychain closure off the async runtime.
async fn run_blocking<T>(
    f: impl FnOnce() -> Result<T, KeyStoreError> + Send + 'static,
) -> Result<T, KeyStoreError>
where
    T: Send + 'static,
{
    tokio::task::spawn_blocking(f)
        .await
        // Join error text carries no key material (panic payloads in the
        // closure cannot format an ApiKey thanks to its redacted Debug).
        .map_err(|e| KeyStoreError::Backend(format!("keychain task failed: {e}")))?
}

#[cfg(test)]
mod tests {
    use super::super::backend::mock::{FailingBackend, MockBackend};
    use super::*;

    const SECRET: &str = "AIzaSy-test-secret-key-value-42";

    fn store_with_mock() -> (KeyStore, Arc<MockBackend>) {
        let backend = Arc::new(MockBackend::default());
        (KeyStore::with_backend(backend.clone()), backend)
    }

    fn api_key(value: &str) -> ApiKey {
        ApiKey::new(value.to_string()).unwrap()
    }

    #[tokio::test]
    async fn store_then_status_reports_key_present() {
        let (store, _) = store_with_mock();
        store
            .store_key(ProviderId::Gemini, api_key(SECRET))
            .await
            .unwrap();
        let status = store.key_status(ProviderId::Gemini).await.unwrap();
        assert_eq!(
            status,
            ProviderKeyStatus {
                provider_id: ProviderId::Gemini,
                key_present: true
            }
        );
    }

    #[tokio::test]
    async fn retrieve_round_trips_the_key() {
        let (store, _) = store_with_mock();
        store
            .store_key(ProviderId::OpenAI, api_key(SECRET))
            .await
            .unwrap();
        let got = store.retrieve_key(ProviderId::OpenAI).await.unwrap();
        assert_eq!(got, Some(api_key(SECRET)));
    }

    #[tokio::test]
    async fn retrieve_unconfigured_provider_returns_none() {
        let (store, _) = store_with_mock();
        assert_eq!(
            store.retrieve_key(ProviderId::Anthropic).await.unwrap(),
            None
        );
    }

    #[tokio::test]
    async fn delete_removes_credential_and_flips_status() {
        // AC-03.7 (keychain half).
        let (store, backend) = store_with_mock();
        store
            .store_key(ProviderId::Gemini, api_key(SECRET))
            .await
            .unwrap();
        store.delete_key(ProviderId::Gemini).await.unwrap();

        let status = store.key_status(ProviderId::Gemini).await.unwrap();
        assert!(!status.key_present);
        assert_eq!(store.retrieve_key(ProviderId::Gemini).await.unwrap(), None);
        assert!(backend.snapshot().is_empty());
    }

    #[tokio::test]
    async fn delete_is_idempotent_for_absent_key() {
        let (store, _) = store_with_mock();
        store.delete_key(ProviderId::OpenRouter).await.unwrap();
    }

    #[tokio::test]
    async fn uses_documented_service_and_account_convention() {
        let (store, backend) = store_with_mock();
        store
            .store_key(ProviderId::Gemini, api_key(SECRET))
            .await
            .unwrap();
        let snapshot = backend.snapshot();
        assert!(snapshot.contains_key(&("ost.provider-api-key".to_string(), "gemini".to_string())));
    }

    #[tokio::test]
    async fn all_statuses_covers_all_four_providers() {
        let (store, _) = store_with_mock();
        store
            .store_key(ProviderId::OpenRouter, api_key(SECRET))
            .await
            .unwrap();
        let statuses = store.all_statuses().await.unwrap();
        assert_eq!(statuses.len(), 4);
        for status in &statuses {
            assert_eq!(
                status.key_present,
                status.provider_id == ProviderId::OpenRouter
            );
        }
    }

    #[tokio::test]
    async fn status_serializes_only_masked_fields() {
        // AC-03.3 backend half: the only serializable key-related type carries
        // provider name + presence flag, nothing else.
        let status = ProviderKeyStatus {
            provider_id: ProviderId::Gemini,
            key_present: true,
        };
        let json = serde_json::to_value(&status).unwrap();
        assert_eq!(
            json,
            serde_json::json!({"provider_id": "gemini", "key_present": true})
        );
    }

    #[tokio::test]
    async fn backend_errors_never_contain_the_key_value() {
        // AC-03.2: key absent from error messages.
        let store = KeyStore::with_backend(Arc::new(FailingBackend));
        let err = store
            .store_key(ProviderId::Gemini, api_key(SECRET))
            .await
            .unwrap_err();
        let rendered = format!("{err} / {err:?}");
        assert!(!rendered.contains(SECRET));
    }

    #[tokio::test]
    async fn error_display_variants_never_contain_key_material() {
        let errors = [
            KeyStoreError::NotFound(ProviderId::Gemini),
            KeyStoreError::InvalidKeyValue,
            KeyStoreError::Backend("platform failure".into()),
        ];
        for err in errors {
            let rendered = format!("{err} / {err:?}");
            assert!(!rendered.contains(SECRET));
        }
    }
}
