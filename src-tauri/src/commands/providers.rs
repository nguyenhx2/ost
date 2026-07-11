//! Thin Tauri command handlers for the translation-provider picker (FR-03.
//! CUSTOM-1..5, TASK-026 part B).
//!
//! Scope is deliberately narrow: these commands never touch the OS keychain
//! (that stays `commands::keys`) and never persist `base_url` (that is
//! Settings-store state owned by the frontend/shell layer, not this layer -
//! `base_url` is not a secret, see security-privacy.md). What this module
//! adds:
//! - Static picker metadata so the WebView can render every provider,
//!   including the local/base-url one, without hardcoding a second list.
//! - A connectivity check for a candidate `base_url` BEFORE the frontend
//!   persists it, so the loopback-only rule (BR-01, NFR-SEC-03) and a
//!   "server not running" condition are reported before the value is saved.

use serde::Serialize;

use crate::keys::ApiKey;
use crate::providers::{
    build_local_openai_provider, KeyValidation, ProviderError, ProviderId, ProviderMetadata,
    TranslationProvider,
};

/// Typed, serializable command error - same redaction posture as
/// `commands::keys::KeyCommandError`: only a stable `kind` tag crosses IPC,
/// never a raw provider/backend string.
#[derive(Debug, thiserror::Error)]
pub enum LocalProviderCommandError {
    /// `base_url` failed to parse, or is not loopback-only.
    #[error("invalid base_url")]
    InvalidBaseUrl,
    /// The local server refused the connection (not running).
    #[error("local server not reachable")]
    LocalServerUnreachable,
    /// Transport failure other than a refused connection.
    #[error("network error")]
    Network,
    /// The request to the local server timed out.
    #[error("request timed out")]
    Timeout,
    /// Any other provider-level failure (unexpected status, bad response).
    #[error("provider error")]
    Provider,
}

impl LocalProviderCommandError {
    fn kind(&self) -> &'static str {
        match self {
            LocalProviderCommandError::InvalidBaseUrl => "invalidBaseUrl",
            LocalProviderCommandError::LocalServerUnreachable => "localServerUnreachable",
            LocalProviderCommandError::Network => "network",
            LocalProviderCommandError::Timeout => "timeout",
            LocalProviderCommandError::Provider => "provider",
        }
    }
}

impl Serialize for LocalProviderCommandError {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        use serde::ser::SerializeStruct;
        let mut s = serializer.serialize_struct("LocalProviderCommandError", 1)?;
        s.serialize_field("kind", self.kind())?;
        s.end()
    }
}

fn map_provider_error(err: ProviderError) -> LocalProviderCommandError {
    match err {
        ProviderError::Config { .. } => LocalProviderCommandError::InvalidBaseUrl,
        ProviderError::LocalServerUnreachable { .. } => {
            LocalProviderCommandError::LocalServerUnreachable
        }
        ProviderError::Network { .. } => LocalProviderCommandError::Network,
        ProviderError::Timeout { .. } => LocalProviderCommandError::Timeout,
        ProviderError::Auth { .. }
        | ProviderError::Quota { .. }
        | ProviderError::InvalidResponse { .. }
        | ProviderError::Api { .. } => LocalProviderCommandError::Provider,
    }
}

/// Core connectivity-check logic, factored out for unit testing against an
/// injected client (no real HTTP in tests).
async fn check_local_provider_connection_impl(
    client: &dyn TranslationProvider,
) -> Result<(), LocalProviderCommandError> {
    // No key exists for this provider (BR-02); the placeholder is never read
    // by the local client and never leaves this function.
    let placeholder = ApiKey::new("unused-placeholder".to_string())
        .expect("static non-empty placeholder is always valid");
    match client.validate_key(&placeholder).await {
        Ok(KeyValidation::Valid) => Ok(()),
        // The local server has no concept of an invalid key; seeing this
        // outcome means something unexpected answered - treat it as a
        // provider-level error rather than silently succeeding.
        Ok(KeyValidation::Invalid { .. }) => Err(LocalProviderCommandError::Provider),
        Err(err) => Err(map_provider_error(err)),
    }
}

/// Static picker metadata for every translation provider, including the
/// local/base-url one (FR-03.CUSTOM-1). Never carries key material.
#[tauri::command]
pub fn provider_picker_metadata() -> Vec<ProviderMetadata> {
    ProviderId::ALL_TRANSLATION
        .into_iter()
        .map(ProviderId::metadata)
        .collect()
}

/// Validates a candidate `base_url` is loopback-only and that a local
/// OpenAI-compatible server answers there, BEFORE the frontend persists the
/// value to the settings store (FR-03.CUSTOM-2).
#[tauri::command]
pub async fn check_local_provider_connection(
    base_url: String,
) -> Result<(), LocalProviderCommandError> {
    let client = build_local_openai_provider(base_url)
        .map_err(|_| LocalProviderCommandError::InvalidBaseUrl)?;
    check_local_provider_connection_impl(client.as_ref()).await
}

#[cfg(test)]
mod tests {
    use async_trait::async_trait;

    use super::*;
    use crate::providers::{ModelInfo, TranslationRequest, TranslationResult, TranslationStream};

    struct MockProvider {
        outcome: fn() -> Result<KeyValidation, ProviderError>,
    }

    #[async_trait]
    impl TranslationProvider for MockProvider {
        fn id(&self) -> ProviderId {
            ProviderId::LocalOpenAi
        }
        async fn translate(
            &self,
            _r: &TranslationRequest,
            _k: &ApiKey,
        ) -> Result<TranslationResult, ProviderError> {
            unreachable!("not exercised by connection-check tests")
        }
        async fn translate_stream(
            &self,
            _r: &TranslationRequest,
            _k: &ApiKey,
        ) -> Result<TranslationStream, ProviderError> {
            unreachable!("not exercised by connection-check tests")
        }
        async fn list_models(&self, _k: Option<&ApiKey>) -> Result<Vec<ModelInfo>, ProviderError> {
            unreachable!("not exercised by connection-check tests")
        }
        async fn validate_key(&self, _key: &ApiKey) -> Result<KeyValidation, ProviderError> {
            (self.outcome)()
        }
    }

    #[tokio::test]
    async fn reachable_server_reports_ok() {
        let client = MockProvider {
            outcome: || Ok(KeyValidation::Valid),
        };
        assert!(check_local_provider_connection_impl(&client).await.is_ok());
    }

    #[tokio::test]
    async fn refused_connection_maps_to_local_server_unreachable_kind() {
        let client = MockProvider {
            outcome: || {
                Err(ProviderError::LocalServerUnreachable {
                    provider: ProviderId::LocalOpenAi,
                    message: "refused".into(),
                })
            },
        };
        let err = check_local_provider_connection_impl(&client)
            .await
            .unwrap_err();
        assert_eq!(err.kind(), "localServerUnreachable");
    }

    #[tokio::test]
    async fn network_failure_maps_to_network_kind() {
        let client = MockProvider {
            outcome: || {
                Err(ProviderError::Network {
                    provider: ProviderId::LocalOpenAi,
                    message: "reset".into(),
                })
            },
        };
        let err = check_local_provider_connection_impl(&client)
            .await
            .unwrap_err();
        assert_eq!(err.kind(), "network");
    }

    #[tokio::test]
    async fn non_loopback_base_url_is_rejected_before_any_call() {
        let err = check_local_provider_connection("https://example.com".into())
            .await
            .unwrap_err();
        assert_eq!(err.kind(), "invalidBaseUrl");
    }

    #[test]
    fn error_serializes_only_the_kind_tag() {
        let json = serde_json::to_value(LocalProviderCommandError::Timeout).unwrap();
        assert_eq!(json, serde_json::json!({ "kind": "timeout" }));
    }

    #[test]
    fn picker_metadata_includes_the_local_provider_with_base_url_flag() {
        let metadata = provider_picker_metadata();
        assert_eq!(metadata.len(), 5);
        let local = metadata
            .iter()
            .find(|m| m.provider_id == ProviderId::LocalOpenAi)
            .expect("local provider must be listed");
        assert!(local.requires_base_url);
        assert!(metadata
            .iter()
            .filter(|m| m.provider_id != ProviderId::LocalOpenAi)
            .all(|m| !m.requires_base_url));
    }
}
