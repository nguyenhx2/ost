//! Provider factory - the single place that maps a [`ProviderId`] to a
//! concrete [`TranslationProvider`] client (FR-03, AC-03.1, AC-03.6).
//!
//! Both the Settings key commands (validate/store) and the future fallback
//! router (AC-03.6) build clients through here, so adding a provider is one
//! match arm and zero call-site changes (NFR-SCA-02). All four providers now
//! have a client, so the factory is total.

use super::anthropic::AnthropicClient;
use super::error::ProviderError;
use super::gemini::GeminiClient;
use super::local_openai::LocalOpenAiClient;
use super::openai::OpenAiClient;
use super::openrouter::OpenRouterClient;
use super::traits::TranslationProvider;
use super::types::ProviderId;

/// Builds the production client for `provider` (default resilience policy,
/// HTTPS-enforced base URL). Errors only on client-build failure
/// ([`ProviderError::Config`]), never on an unknown provider - the enum is
/// closed over the four supported providers.
///
/// `ProviderId::LocalOpenAi` is NOT buildable through this function: it needs
/// a user-supplied `base_url` that this signature has no slot for. Callers
/// building that provider MUST use [`build_local_openai_provider`] instead;
/// asking this function for it is a caller error, mapped to
/// [`ProviderError::Config`].
pub fn build_provider(provider: ProviderId) -> Result<Box<dyn TranslationProvider>, ProviderError> {
    Ok(match provider {
        ProviderId::Gemini => Box::new(GeminiClient::new()?),
        ProviderId::Anthropic => Box::new(AnthropicClient::new()?),
        ProviderId::OpenAI => Box::new(OpenAiClient::new()?),
        ProviderId::OpenRouter => Box::new(OpenRouterClient::new()?),
        ProviderId::LocalOpenAi => {
            return Err(ProviderError::Config {
                provider,
                message: "local_openai requires a base_url - use build_local_openai_provider"
                    .into(),
            })
        }
    })
}

/// Builds the local OpenAI-compatible client (LM Studio and similar, FR-03.
/// CUSTOM-1) against a user-supplied `base_url`. Rejects any non-loopback
/// `base_url` with [`ProviderError::Config`] (BR-01, NFR-SEC-03) - the only
/// place that constraint is enforced for this provider.
pub fn build_local_openai_provider(
    base_url: impl Into<String>,
) -> Result<Box<dyn TranslationProvider>, ProviderError> {
    Ok(Box::new(LocalOpenAiClient::new(base_url)?))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_a_client_for_every_keychain_provider_id() {
        // AC-03.1/AC-03.6: all four keychain-backed providers resolve to a
        // client whose id matches the requested provider.
        for id in ProviderId::ALL {
            let client = build_provider(id).expect("every provider must build");
            assert_eq!(client.id(), id);
        }
    }

    #[test]
    fn build_provider_rejects_local_openai_without_base_url() {
        match build_provider(ProviderId::LocalOpenAi) {
            Err(err) => assert!(matches!(err, ProviderError::Config { .. })),
            Ok(_) => panic!("local_openai must not build without an explicit base_url"),
        }
    }

    #[test]
    fn build_local_openai_provider_builds_a_client_for_loopback_url() {
        let client = build_local_openai_provider("http://127.0.0.1:1234")
            .expect("loopback base_url must build");
        assert_eq!(client.id(), ProviderId::LocalOpenAi);
    }

    #[test]
    fn build_local_openai_provider_rejects_non_loopback_url() {
        match build_local_openai_provider("https://example.com") {
            Err(err) => assert!(matches!(err, ProviderError::Config { .. })),
            Ok(_) => panic!("expected non-loopback base_url to be rejected"),
        }
    }
}
