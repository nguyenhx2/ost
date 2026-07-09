//! HTTP resilience configuration shared by provider clients.
//!
//! Defaults are conservative placeholders documented in
//! `docs/architecture/api-contracts/providers.md`; they are constructor
//! parameters so callers (settings layer, later tasks) can tune them without
//! touching this module.

use std::time::Duration;

/// Timeouts and bounded-retry policy for one provider client.
#[derive(Debug, Clone)]
pub struct ProviderHttpConfig {
    /// Base URL of the provider API. Tests override this with a wiremock URL;
    /// production values MUST be `https://` (enforced by the clients,
    /// NFR-SEC-07 - plain `http://` is allowed for loopback only).
    pub base_url: String,
    /// Total time budget for a non-streaming request (connect + response).
    pub request_timeout: Duration,
    /// TCP/TLS connect budget.
    pub connect_timeout: Duration,
    /// For streaming: maximum silence between chunks before aborting.
    pub stream_idle_timeout: Duration,
    /// Bounded retries for transient failures (network errors / HTTP 5xx)
    /// on translate calls. 0 = single attempt. `validate_key` NEVER retries.
    pub max_retries: u32,
    /// Base backoff; attempt N sleeps `retry_backoff * 2^N`.
    pub retry_backoff: Duration,
}

impl ProviderHttpConfig {
    /// Default policy with a provider-specific base URL.
    pub fn with_base_url(base_url: impl Into<String>) -> Self {
        Self {
            base_url: base_url.into(),
            request_timeout: Duration::from_secs(30),
            connect_timeout: Duration::from_secs(10),
            stream_idle_timeout: Duration::from_secs(30),
            max_retries: 2,
            retry_backoff: Duration::from_millis(200),
        }
    }

    /// True when the base URL is acceptable under NFR-SEC-07:
    /// `https://` anywhere, or `http://` to loopback (tests only).
    pub fn base_url_is_allowed(&self) -> bool {
        if self.base_url.starts_with("https://") {
            return true;
        }
        if let Some(rest) = self.base_url.strip_prefix("http://") {
            let host = rest
                .split('/')
                .next()
                .unwrap_or("")
                .rsplit_once(':')
                .map_or_else(|| rest.split('/').next().unwrap_or(""), |(h, _)| h);
            return host == "127.0.0.1" || host == "localhost" || host == "[::1]";
        }
        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn https_urls_are_allowed() {
        let cfg = ProviderHttpConfig::with_base_url("https://generativelanguage.googleapis.com");
        assert!(cfg.base_url_is_allowed());
    }

    #[test]
    fn loopback_http_is_allowed_for_tests() {
        assert!(ProviderHttpConfig::with_base_url("http://127.0.0.1:8080").base_url_is_allowed());
        assert!(ProviderHttpConfig::with_base_url("http://localhost:8080/x").base_url_is_allowed());
    }

    #[test]
    fn non_loopback_http_is_rejected() {
        assert!(!ProviderHttpConfig::with_base_url("http://example.com").base_url_is_allowed());
        assert!(!ProviderHttpConfig::with_base_url("ftp://127.0.0.1").base_url_is_allowed());
    }

    #[test]
    fn defaults_are_bounded() {
        let cfg = ProviderHttpConfig::with_base_url("https://x");
        assert!(cfg.max_retries <= 3);
        assert!(cfg.request_timeout <= Duration::from_secs(60));
    }
}
