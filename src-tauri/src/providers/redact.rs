//! Log/error redaction - part of the provider layer per NFR-SEC-08.
//!
//! Defense in depth for key material:
//! 1. Keys travel in HTTP headers only, never in URLs (URLs get logged).
//! 2. Every provider-supplied message that could echo a request back (error
//!    bodies, status texts) passes through [`redact_secret`] before being
//!    stored in a [`super::ProviderError`] or logged.
//! 3. Messages are also truncated so giant provider bodies cannot flood logs.

/// Placeholder inserted wherever a secret occurred.
pub const REDACTED: &str = "[REDACTED]";

/// Maximum length of a provider-supplied message kept in errors/logs.
const MAX_MESSAGE_LEN: usize = 300;

/// Replaces every occurrence of `secret` in `text` with `[REDACTED]` and
/// truncates the result to a bounded length.
pub fn redact_secret(text: &str, secret: &str) -> String {
    let replaced = if secret.is_empty() {
        text.to_string()
    } else {
        text.replace(secret, REDACTED)
    };
    truncate_chars(&replaced, MAX_MESSAGE_LEN)
}

fn truncate_chars(text: &str, max: usize) -> String {
    if text.chars().count() <= max {
        text.to_string()
    } else {
        let mut out: String = text.chars().take(max).collect();
        out.push_str("...");
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn removes_all_occurrences_of_the_secret() {
        let out = redact_secret("bad key sk-123, again sk-123!", "sk-123");
        assert!(!out.contains("sk-123"));
        assert_eq!(out, "bad key [REDACTED], again [REDACTED]!");
    }

    #[test]
    fn empty_secret_does_not_explode_the_text() {
        assert_eq!(redact_secret("hello", ""), "hello");
    }

    #[test]
    fn truncates_oversized_messages() {
        let big = "x".repeat(1000);
        let out = redact_secret(&big, "nope");
        assert!(out.chars().count() <= 303);
        assert!(out.ends_with("..."));
    }

    #[test]
    fn handles_multibyte_text_without_panicking() {
        let text = "chào ".repeat(200);
        let out = redact_secret(&text, "secret");
        assert!(out.chars().count() <= 303);
    }
}
