//! HTTP resilience configuration shared by provider clients.
//!
//! Defaults are conservative placeholders documented in
//! `docs/architecture/api-contracts/providers.md`; they are constructor
//! parameters so callers (settings layer, later tasks) can tune them without
//! touching this module.

use std::time::Duration;

use url::{Host, Url};

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
    ///
    /// Parsing goes through the `url` crate so the check sees the same host
    /// reqwest will connect to. Naive string splitting is unsafe here: a value
    /// like `http://localhost:8080@evil.com` embeds `localhost:8080` as
    /// userinfo and actually targets `evil.com`. Any URL carrying userinfo is
    /// rejected outright.
    pub fn base_url_is_allowed(&self) -> bool {
        let Ok(url) = Url::parse(&self.base_url) else {
            return false;
        };
        // Reject embedded credentials/userinfo; the real host would differ from
        // a naive read of the string.
        if !url.username().is_empty() || url.password().is_some() {
            return false;
        }
        match url.scheme() {
            "https" => true,
            "http" => Self::host_is_loopback(&url),
            _ => false,
        }
    }

    /// True when `base_url` targets loopback (`127.0.0.1` / `localhost` /
    /// `[::1]`) REGARDLESS of scheme, with no embedded userinfo. Unlike
    /// [`Self::base_url_is_allowed`] (which allows any `https://` host for the
    /// cloud provider clients), this is the stricter check for clients that
    /// must never egress off the local machine even over `https://` - e.g. the
    /// local OpenAI-compatible provider (FR-03.CUSTOM-2, BR-01, NFR-SEC-03).
    pub fn is_loopback_only(&self) -> bool {
        let Ok(url) = Url::parse(&self.base_url) else {
            return false;
        };
        if !url.username().is_empty() || url.password().is_some() {
            return false;
        }
        if !matches!(url.scheme(), "http" | "https") {
            return false;
        }
        Self::host_is_loopback(&url)
    }

    /// Shared host check: `localhost` domain, or a loopback IPv4/IPv6 literal.
    fn host_is_loopback(url: &Url) -> bool {
        match url.host() {
            Some(Host::Domain("localhost")) => true,
            Some(Host::Ipv4(ip)) => ip.is_loopback(),
            Some(Host::Ipv6(ip)) => ip.is_loopback(),
            _ => false,
        }
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
    fn userinfo_embedding_loopback_is_rejected() {
        // reqwest connects to `evil.com` here; the loopback-looking prefix is
        // userinfo, not the host. Naive `rsplit_once(':')` parsing accepted it.
        assert!(
            !ProviderHttpConfig::with_base_url("http://localhost:8080@evil.com")
                .base_url_is_allowed()
        );
        assert!(
            !ProviderHttpConfig::with_base_url("http://127.0.0.1@evil.com").base_url_is_allowed()
        );
        assert!(
            !ProviderHttpConfig::with_base_url("https://localhost@evil.com").base_url_is_allowed()
        );
        // Password-only userinfo form.
        assert!(!ProviderHttpConfig::with_base_url("http://:pass@evil.com").base_url_is_allowed());
    }

    #[test]
    fn loopback_ipv6_http_is_allowed() {
        assert!(ProviderHttpConfig::with_base_url("http://[::1]:8080").base_url_is_allowed());
    }

    #[test]
    fn malformed_url_is_rejected() {
        assert!(!ProviderHttpConfig::with_base_url("not a url").base_url_is_allowed());
        assert!(!ProviderHttpConfig::with_base_url("").base_url_is_allowed());
    }

    #[test]
    fn is_loopback_only_accepts_http_and_https_loopback() {
        assert!(ProviderHttpConfig::with_base_url("http://127.0.0.1:1234").is_loopback_only());
        assert!(ProviderHttpConfig::with_base_url("http://localhost:1234").is_loopback_only());
        assert!(ProviderHttpConfig::with_base_url("https://127.0.0.1:1234").is_loopback_only());
        assert!(ProviderHttpConfig::with_base_url("http://[::1]:1234").is_loopback_only());
    }

    #[test]
    fn is_loopback_only_rejects_non_loopback_hosts_even_over_https() {
        // The stricter check must reject a real domain even under https://,
        // unlike `base_url_is_allowed` which permits any https:// host.
        assert!(!ProviderHttpConfig::with_base_url("https://example.com").is_loopback_only());
        assert!(!ProviderHttpConfig::with_base_url("http://example.com").is_loopback_only());
        assert!(!ProviderHttpConfig::with_base_url("ftp://127.0.0.1").is_loopback_only());
        assert!(!ProviderHttpConfig::with_base_url("not a url").is_loopback_only());
    }

    #[test]
    fn is_loopback_only_rejects_userinfo_embedding_loopback() {
        assert!(
            !ProviderHttpConfig::with_base_url("http://localhost:8080@evil.com").is_loopback_only()
        );
    }

    #[test]
    fn defaults_are_bounded() {
        let cfg = ProviderHttpConfig::with_base_url("https://x");
        assert!(cfg.max_retries <= 3);
        assert!(cfg.request_timeout <= Duration::from_secs(60));
    }
}
