//! Typed provider error taxonomy (FR-03).
//!
//! The variants are the contract the future fallback router (AC-03.6,
//! TASK follow-up) is built on: `Auth` / `Quota` / `Network` / `Timeout` are
//! the trigger classes; `InvalidResponse` and `Api` cover schema and residual
//! HTTP failures. Every `message` is produced through
//! [`super::redact::redact_secret`] before construction - no variant may ever
//! carry key material (NFR-SEC-08).

use super::types::ProviderId;

/// Errors returned by every [`super::TranslationProvider`] implementation.
#[derive(Debug, thiserror::Error)]
pub enum ProviderError {
    /// The API key was rejected (401/403 or provider-specific invalid-key
    /// signals). The fallback router treats the provider as misconfigured.
    #[error("authentication with {provider} failed: {message}")]
    Auth {
        provider: ProviderId,
        message: String,
    },

    /// Quota exhausted or rate limited (HTTP 429).
    #[error("{provider} quota/rate limit exceeded: {message}")]
    Quota {
        provider: ProviderId,
        message: String,
    },

    /// Connection-level failure (DNS, refused, TLS, reset).
    #[error("network error calling {provider}: {message}")]
    Network {
        provider: ProviderId,
        message: String,
    },

    /// The configured request or stream-idle timeout elapsed.
    #[error("request to {provider} timed out after {timeout_ms} ms")]
    Timeout {
        provider: ProviderId,
        timeout_ms: u64,
    },

    /// The response did not match the provider schema (serde validation
    /// failed or required fields were missing) - the payload is NOT used
    /// (AC-03.8).
    #[error("invalid response from {provider}: {message}")]
    InvalidResponse {
        provider: ProviderId,
        message: String,
    },

    /// Any other non-success HTTP status.
    #[error("{provider} returned HTTP {status}: {message}")]
    Api {
        provider: ProviderId,
        status: u16,
        message: String,
    },

    /// Client-side configuration is invalid (insecure base URL, malformed
    /// model id, HTTP client build failure). Never a fallback trigger.
    #[error("{provider} client configuration error: {message}")]
    Config {
        provider: ProviderId,
        message: String,
    },
}

impl ProviderError {
    /// The provider this error came from (router bookkeeping).
    pub fn provider(&self) -> ProviderId {
        match self {
            ProviderError::Auth { provider, .. }
            | ProviderError::Quota { provider, .. }
            | ProviderError::Network { provider, .. }
            | ProviderError::Timeout { provider, .. }
            | ProviderError::InvalidResponse { provider, .. }
            | ProviderError::Api { provider, .. }
            | ProviderError::Config { provider, .. } => *provider,
        }
    }

    /// Whether the fallback router should try the next provider for this
    /// error class (AC-03.6 groundwork: auth/quota/network/timeout).
    pub fn is_fallback_trigger(&self) -> bool {
        matches!(
            self,
            ProviderError::Auth { .. }
                | ProviderError::Quota { .. }
                | ProviderError::Network { .. }
                | ProviderError::Timeout { .. }
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fallback_trigger_classes_match_spec() {
        let p = ProviderId::Gemini;
        assert!(ProviderError::Auth {
            provider: p,
            message: "m".into()
        }
        .is_fallback_trigger());
        assert!(ProviderError::Quota {
            provider: p,
            message: "m".into()
        }
        .is_fallback_trigger());
        assert!(ProviderError::Network {
            provider: p,
            message: "m".into()
        }
        .is_fallback_trigger());
        assert!(ProviderError::Timeout {
            provider: p,
            timeout_ms: 100
        }
        .is_fallback_trigger());
        assert!(!ProviderError::InvalidResponse {
            provider: p,
            message: "m".into()
        }
        .is_fallback_trigger());
    }
}
