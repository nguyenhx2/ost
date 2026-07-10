//! Thin Tauri command handlers for provider API key management (FR-03, TASK-009).
//!
//! These commands are the ONLY bridge between the Settings WebView and the key
//! store / provider layer. Security invariants they uphold (BR-02, NFR-SEC-01,
//! AC-03.2, AC-03.3):
//! - The WebView may send a key value DOWN once (during entry) but NEVER
//!   receives one back: every return type here is masked status, a validation
//!   verdict, or a typed error - never the key newtype and never its exposed
//!   raw text (enforced by a source-scan test below).
//! - Keys are validated (one minimal provider call, AC-03.4) and then written
//!   ONLY to the OS keychain through [`KeyStore`]; an invalid key is never
//!   stored.
//! - Error surfaces are typed `kind`s (network/quota/...); no variant carries
//!   key material or raw provider text that could leak a secret.

use serde::Serialize;
use tauri::State;

use crate::keys::{ApiKey, KeyStore, KeyStoreError, ProviderKeyStatus};
use crate::providers::{
    GeminiClient, KeyValidation, ProviderError, ProviderId, TranslationProvider,
};

/// Typed, serializable command error. Serialized as `{ "kind": "<kind>" }` so
/// the WebView maps the class to a localized message (i18n) and NEVER renders a
/// raw backend string. No variant carries key material or user content.
#[derive(Debug, thiserror::Error)]
pub enum KeyCommandError {
    /// The provider id string was not one of the four known providers.
    #[error("unknown provider")]
    UnknownProvider,
    /// The submitted key value is empty or structurally invalid.
    #[error("invalid key input")]
    InvalidInput,
    /// No key is configured for the provider (check requested with no key).
    #[error("no key configured")]
    NotConfigured,
    /// Transport failure reaching the provider (DNS/refused/TLS/reset).
    #[error("network error")]
    Network,
    /// Provider quota exhausted or rate limited.
    #[error("quota exceeded")]
    Quota,
    /// The provider request timed out.
    #[error("request timed out")]
    Timeout,
    /// Client-side / provider configuration error.
    #[error("configuration error")]
    Config,
    /// The OS keychain read/write failed.
    #[error("keychain error")]
    Keychain,
    /// Any other provider failure (invalid response, residual HTTP status).
    #[error("provider error")]
    Provider,
}

impl KeyCommandError {
    /// Stable machine `kind` the WebView maps to an i18n message.
    fn kind(&self) -> &'static str {
        match self {
            KeyCommandError::UnknownProvider => "unknownProvider",
            KeyCommandError::InvalidInput => "invalidInput",
            KeyCommandError::NotConfigured => "notConfigured",
            KeyCommandError::Network => "network",
            KeyCommandError::Quota => "quota",
            KeyCommandError::Timeout => "timeout",
            KeyCommandError::Config => "config",
            KeyCommandError::Keychain => "keychain",
            KeyCommandError::Provider => "provider",
        }
    }
}

impl Serialize for KeyCommandError {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        use serde::ser::SerializeStruct;
        let mut s = serializer.serialize_struct("KeyCommandError", 1)?;
        s.serialize_field("kind", self.kind())?;
        s.end()
    }
}

impl From<KeyStoreError> for KeyCommandError {
    fn from(_: KeyStoreError) -> Self {
        // The KeyStoreError message is key-free by construction; we still map to
        // a coarse class so the WebView never sees backend text.
        KeyCommandError::Keychain
    }
}

/// Outcome of a save-key request (AC-03.1/AC-03.4). Serialized as a tagged
/// union `{ "status": "valid" | "stored" | "invalid", ... }`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum SaveKeyOutcome {
    /// The key passed the provider check and was stored.
    Valid,
    /// The key was stored without a live check (no client for this provider
    /// yet - Anthropic/OpenAI/OpenRouter land later, NFR-SCA-02). The UI shows
    /// a "saved, not validated" status.
    Stored,
    /// The provider rejected the key; it was NOT stored. `reason` is the
    /// redacted, key-free provider reason (AC-03.4); the UI shows its own copy.
    Invalid { reason: String },
}

/// Provider-client factory. Returns `Ok(None)` for providers without a client
/// yet, so their keys can still be stored (AC-03.1) without a live check.
fn provider_client(
    provider: ProviderId,
) -> Result<Option<Box<dyn TranslationProvider>>, KeyCommandError> {
    match provider {
        ProviderId::Gemini => {
            let client = GeminiClient::new().map_err(|_| KeyCommandError::Config)?;
            Ok(Some(Box::new(client)))
        }
        // Follow-up provider modules implement the same trait (zero call-site
        // changes); until then their keys are stored unvalidated.
        ProviderId::Anthropic | ProviderId::OpenAI | ProviderId::OpenRouter => Ok(None),
    }
}

/// Parse a provider id string coming from the WebView.
fn parse_provider(provider: &str) -> Result<ProviderId, KeyCommandError> {
    provider
        .parse::<ProviderId>()
        .map_err(|_| KeyCommandError::UnknownProvider)
}

/// Map a transport/provider error to a typed command error (no secrets).
fn map_provider_error(err: ProviderError) -> KeyCommandError {
    match err {
        ProviderError::Quota { .. } => KeyCommandError::Quota,
        ProviderError::Network { .. } => KeyCommandError::Network,
        ProviderError::Timeout { .. } => KeyCommandError::Timeout,
        ProviderError::Config { .. } => KeyCommandError::Config,
        ProviderError::Auth { .. }
        | ProviderError::InvalidResponse { .. }
        | ProviderError::Api { .. } => KeyCommandError::Provider,
    }
}

/// Core save logic, factored out of the Tauri wrapper for unit testing with an
/// injected [`KeyStore`] backend and provider client.
async fn save_key_impl(
    store: &KeyStore,
    provider: ProviderId,
    key: String,
    client: Option<&dyn TranslationProvider>,
) -> Result<SaveKeyOutcome, KeyCommandError> {
    let api_key = ApiKey::new(key).map_err(|_| KeyCommandError::InvalidInput)?;

    match client {
        None => {
            // No live check available; store and report "stored" (AC-03.1).
            store.store_key(provider, api_key).await?;
            Ok(SaveKeyOutcome::Stored)
        }
        Some(client) => match client.validate_key(&api_key).await {
            Ok(KeyValidation::Valid) => {
                store.store_key(provider, api_key).await?;
                Ok(SaveKeyOutcome::Valid)
            }
            // Rejected key: do NOT store (AC-03.4). `reason` is redacted.
            Ok(KeyValidation::Invalid { reason }) => Ok(SaveKeyOutcome::Invalid { reason }),
            Err(err) => Err(map_provider_error(err)),
        },
    }
}

/// Core check logic (AC-03.4): validate the STORED key without it ever crossing
/// IPC - the key is read from the keychain in the core and passed to the
/// provider by reference.
async fn check_key_impl(
    store: &KeyStore,
    provider: ProviderId,
    client: Option<&dyn TranslationProvider>,
) -> Result<KeyValidation, KeyCommandError> {
    let api_key = store
        .retrieve_key(provider)
        .await?
        .ok_or(KeyCommandError::NotConfigured)?;
    match client {
        // Cannot check without a client; treat as valid-by-presence is wrong -
        // report a config class so the UI can say "check unavailable".
        None => Err(KeyCommandError::Config),
        Some(client) => client
            .validate_key(&api_key)
            .await
            .map_err(map_provider_error),
    }
}

/* ------------------------------------------------------------------ */
/* Tauri command wrappers (thin: parse input, call impl, map errors)   */
/* ------------------------------------------------------------------ */

/// Masked status for all four providers (AC-03.1, AC-03.3). The ONLY key-shaped
/// data the WebView receives: provider id + `key_present`.
#[tauri::command]
pub async fn provider_key_statuses(
    store: State<'_, KeyStore>,
) -> Result<Vec<ProviderKeyStatus>, KeyCommandError> {
    store.all_statuses().await.map_err(Into::into)
}

/// Validate (AC-03.4) then store (AC-03.2) a provider key. The `key` string is
/// consumed here and never returned to the WebView.
#[tauri::command]
pub async fn save_provider_key(
    store: State<'_, KeyStore>,
    provider: String,
    key: String,
) -> Result<SaveKeyOutcome, KeyCommandError> {
    let provider = parse_provider(&provider)?;
    let client = provider_client(provider)?;
    save_key_impl(&store, provider, key, client.as_deref()).await
}

/// User-triggered key check on the already-stored key (AC-03.4).
#[tauri::command]
pub async fn check_provider_key(
    store: State<'_, KeyStore>,
    provider: String,
) -> Result<KeyValidation, KeyCommandError> {
    let provider = parse_provider(&provider)?;
    let client = provider_client(provider)?;
    check_key_impl(&store, provider, client.as_deref()).await
}

/// Remove a provider key from the keychain (AC-03.7). Idempotent.
#[tauri::command]
pub async fn delete_provider_key(
    store: State<'_, KeyStore>,
    provider: String,
) -> Result<(), KeyCommandError> {
    let provider = parse_provider(&provider)?;
    store.delete_key(provider).await.map_err(Into::into)
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;
    use std::sync::{Arc, Mutex};

    use async_trait::async_trait;

    use super::*;
    use crate::keys::{KeyBackend, KeyStore};
    use crate::providers::{ModelInfo, TranslationRequest, TranslationResult, TranslationStream};

    const SECRET: &str = "FAKE-TEST-KEY-should-never-surface-42";

    /// In-memory keychain backend for command-layer tests (the real Credential
    /// Manager round-trip is covered by an `#[ignore]` smoke test in
    /// `keys/backend.rs`).
    #[derive(Default)]
    struct MockBackend {
        entries: Mutex<HashMap<(String, String), String>>,
    }

    impl KeyBackend for MockBackend {
        fn set_secret(
            &self,
            service: &str,
            account: &str,
            value: &str,
        ) -> Result<(), KeyStoreError> {
            self.entries
                .lock()
                .unwrap()
                .insert((service.into(), account.into()), value.into());
            Ok(())
        }
        fn get_secret(
            &self,
            service: &str,
            account: &str,
        ) -> Result<Option<String>, KeyStoreError> {
            Ok(self
                .entries
                .lock()
                .unwrap()
                .get(&(service.into(), account.into()))
                .cloned())
        }
        fn delete_secret(&self, service: &str, account: &str) -> Result<(), KeyStoreError> {
            self.entries
                .lock()
                .unwrap()
                .remove(&(service.into(), account.into()));
            Ok(())
        }
    }

    /// Minimal provider whose `validate_key` outcome is scripted per test.
    struct MockProvider {
        outcome: fn(&ApiKey) -> Result<KeyValidation, ProviderError>,
    }

    #[async_trait]
    impl TranslationProvider for MockProvider {
        fn id(&self) -> ProviderId {
            ProviderId::Gemini
        }
        async fn translate(
            &self,
            _r: &TranslationRequest,
            _k: &ApiKey,
        ) -> Result<TranslationResult, ProviderError> {
            unreachable!("not exercised by key-command tests")
        }
        async fn translate_stream(
            &self,
            _r: &TranslationRequest,
            _k: &ApiKey,
        ) -> Result<TranslationStream, ProviderError> {
            unreachable!("not exercised by key-command tests")
        }
        async fn list_models(&self, _k: Option<&ApiKey>) -> Result<Vec<ModelInfo>, ProviderError> {
            unreachable!("not exercised by key-command tests")
        }
        async fn validate_key(&self, key: &ApiKey) -> Result<KeyValidation, ProviderError> {
            (self.outcome)(key)
        }
    }

    fn valid_provider() -> MockProvider {
        MockProvider {
            outcome: |_| Ok(KeyValidation::Valid),
        }
    }

    fn invalid_provider() -> MockProvider {
        MockProvider {
            outcome: |_| {
                Ok(KeyValidation::Invalid {
                    reason: "API key not valid ([REDACTED])".into(),
                })
            },
        }
    }

    fn network_failing_provider() -> MockProvider {
        MockProvider {
            outcome: |_| {
                Err(ProviderError::Network {
                    provider: ProviderId::Gemini,
                    message: "connection refused".into(),
                })
            },
        }
    }

    fn quota_provider() -> MockProvider {
        MockProvider {
            outcome: |_| {
                Err(ProviderError::Quota {
                    provider: ProviderId::Gemini,
                    message: "rate limited".into(),
                })
            },
        }
    }

    fn mock_store() -> KeyStore {
        KeyStore::with_backend(Arc::new(MockBackend::default()))
    }

    #[tokio::test]
    async fn valid_key_is_stored_and_reports_valid() {
        let store = mock_store();
        let provider = valid_provider();
        let outcome = save_key_impl(&store, ProviderId::Gemini, SECRET.into(), Some(&provider))
            .await
            .unwrap();
        assert_eq!(outcome, SaveKeyOutcome::Valid);
        // Stored: status flips to present.
        let status = store.key_status(ProviderId::Gemini).await.unwrap();
        assert!(status.key_present);
    }

    #[tokio::test]
    async fn invalid_key_is_not_stored() {
        let store = mock_store();
        let provider = invalid_provider();
        let outcome = save_key_impl(&store, ProviderId::Gemini, SECRET.into(), Some(&provider))
            .await
            .unwrap();
        assert!(matches!(outcome, SaveKeyOutcome::Invalid { .. }));
        // AC-03.4: rejected key was NOT written to the keychain.
        let status = store.key_status(ProviderId::Gemini).await.unwrap();
        assert!(!status.key_present);
    }

    #[tokio::test]
    async fn provider_without_client_stores_unvalidated() {
        let store = mock_store();
        let outcome = save_key_impl(&store, ProviderId::Anthropic, SECRET.into(), None)
            .await
            .unwrap();
        assert_eq!(outcome, SaveKeyOutcome::Stored);
        assert!(
            store
                .key_status(ProviderId::Anthropic)
                .await
                .unwrap()
                .key_present
        );
    }

    #[tokio::test]
    async fn empty_key_is_rejected_as_invalid_input() {
        let store = mock_store();
        let provider = valid_provider();
        let err = save_key_impl(&store, ProviderId::Gemini, "   ".into(), Some(&provider))
            .await
            .unwrap_err();
        assert!(matches!(err, KeyCommandError::InvalidInput));
    }

    #[tokio::test]
    async fn network_failure_maps_to_network_kind() {
        let store = mock_store();
        let provider = network_failing_provider();
        let err = save_key_impl(&store, ProviderId::Gemini, SECRET.into(), Some(&provider))
            .await
            .unwrap_err();
        assert_eq!(err.kind(), "network");
        // Not stored on transport failure.
        assert!(
            !store
                .key_status(ProviderId::Gemini)
                .await
                .unwrap()
                .key_present
        );
    }

    #[tokio::test]
    async fn quota_failure_maps_to_quota_kind() {
        let store = mock_store();
        let provider = quota_provider();
        let err = save_key_impl(&store, ProviderId::Gemini, SECRET.into(), Some(&provider))
            .await
            .unwrap_err();
        assert_eq!(err.kind(), "quota");
    }

    #[tokio::test]
    async fn check_validates_the_stored_key() {
        let store = mock_store();
        let valid = valid_provider();
        save_key_impl(&store, ProviderId::Gemini, SECRET.into(), Some(&valid))
            .await
            .unwrap();
        let validation = check_key_impl(&store, ProviderId::Gemini, Some(&valid))
            .await
            .unwrap();
        assert_eq!(validation, KeyValidation::Valid);
    }

    #[tokio::test]
    async fn check_without_stored_key_reports_not_configured() {
        let store = mock_store();
        let valid = valid_provider();
        let err = check_key_impl(&store, ProviderId::OpenAI, Some(&valid))
            .await
            .unwrap_err();
        assert!(matches!(err, KeyCommandError::NotConfigured));
    }

    #[test]
    fn error_serializes_only_the_kind_tag() {
        let json = serde_json::to_value(KeyCommandError::Quota).unwrap();
        assert_eq!(json, serde_json::json!({ "kind": "quota" }));
    }

    #[test]
    fn parse_provider_rejects_unknown() {
        assert!(matches!(
            parse_provider("claude"),
            Err(KeyCommandError::UnknownProvider)
        ));
        assert_eq!(parse_provider("gemini").unwrap(), ProviderId::Gemini);
    }

    // --- Follow-up (2): the command surface never returns / exposes a key. ---

    /// Source-level guard: no command handler in this module reads the raw
    /// secret or returns the `ApiKey` newtype. Needles are assembled at runtime
    /// so this assertion's own text does not trip it.
    #[test]
    fn command_module_never_exposes_key_material() {
        let src = include_str!("keys.rs");
        let expose_call = format!(".{}(", "expose");
        assert!(
            !src.contains(&expose_call),
            "no key command may call ApiKey::expose - the value must stay in the core"
        );
        for needle in [
            format!("-> {}", "ApiKey"),
            format!("Result<{}", "ApiKey"),
            format!("Vec<{}", "ApiKey"),
            format!("Option<{}", "ApiKey"),
        ] {
            assert!(
                !src.contains(&needle),
                "no command may return the ApiKey newtype across IPC"
            );
        }
    }

    /// Runtime guard: serialize every value returned by every command and prove
    /// the stored secret never appears in an IPC payload (AC-03.2, AC-03.3).
    #[tokio::test]
    async fn no_command_return_value_contains_the_key() {
        let store = mock_store();
        let valid = valid_provider();

        let save = save_key_impl(&store, ProviderId::Gemini, SECRET.into(), Some(&valid))
            .await
            .unwrap();
        let statuses = store.all_statuses().await.unwrap();
        let check = check_key_impl(&store, ProviderId::Gemini, Some(&valid))
            .await
            .unwrap();

        let payloads = [
            serde_json::to_string(&save).unwrap(),
            serde_json::to_string(&statuses).unwrap(),
            serde_json::to_string(&check).unwrap(),
            serde_json::to_string(&KeyCommandError::Keychain).unwrap(),
        ];
        for payload in payloads {
            assert!(
                !payload.contains(SECRET),
                "IPC return payload must never contain key material: {payload}"
            );
        }
    }
}
