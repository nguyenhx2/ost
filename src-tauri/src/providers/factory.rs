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
use super::openai::OpenAiClient;
use super::openrouter::OpenRouterClient;
use super::traits::TranslationProvider;
use super::types::ProviderId;

/// Builds the production client for `provider` (default resilience policy,
/// HTTPS-enforced base URL). Errors only on client-build failure
/// ([`ProviderError::Config`]), never on an unknown provider - the enum is
/// closed over the four supported providers.
pub fn build_provider(provider: ProviderId) -> Result<Box<dyn TranslationProvider>, ProviderError> {
    Ok(match provider {
        ProviderId::Gemini => Box::new(GeminiClient::new()?),
        ProviderId::Anthropic => Box::new(AnthropicClient::new()?),
        ProviderId::OpenAI => Box::new(OpenAiClient::new()?),
        ProviderId::OpenRouter => Box::new(OpenRouterClient::new()?),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_a_client_for_every_provider_id() {
        // AC-03.1/AC-03.6: all four providers resolve to a client whose id
        // matches the requested provider.
        for id in ProviderId::ALL {
            let client = build_provider(id).expect("every provider must build");
            assert_eq!(client.id(), id);
        }
    }
}
