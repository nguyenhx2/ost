//! `ApiKey` - a redacting newtype around a provider API key value.
//!
//! Security properties (NFR-SEC-01, NFR-SEC-08, BR-02):
//! - `Debug` never prints the value (`ApiKey([REDACTED])`), so keys cannot leak
//!   through logs, panics, or `{:?}` formatting.
//! - No `Display` impl: `format!("{}", key)` does not compile.
//! - No `Serialize`/`Deserialize` impls: the value cannot cross the IPC boundary
//!   or land in the settings store through serde by construction.
//! - The raw value is reachable only through the explicit [`ApiKey::expose`]
//!   call, which keeps every read of the secret greppable in review.

use super::error::KeyStoreError;

/// A provider API key held in memory for the duration of a single operation.
#[derive(Clone, PartialEq, Eq)]
pub struct ApiKey(String);

impl ApiKey {
    /// Wraps a raw key value. Rejects empty/whitespace-only values and values
    /// containing control characters (defense against header injection).
    pub fn new(value: String) -> Result<Self, KeyStoreError> {
        if value.trim().is_empty() {
            return Err(KeyStoreError::InvalidKeyValue);
        }
        if value.chars().any(char::is_control) {
            return Err(KeyStoreError::InvalidKeyValue);
        }
        Ok(Self(value))
    }

    /// Returns the raw key value. Call sites are limited to the provider layer
    /// (HTTP auth header) and the keychain backend write path.
    pub fn expose(&self) -> &str {
        &self.0
    }
}

impl std::fmt::Debug for ApiKey {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("ApiKey([REDACTED])")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn debug_output_is_redacted() {
        let key = ApiKey::new("sk-super-secret-value-123".to_string()).unwrap();
        let debug = format!("{key:?}");
        assert!(!debug.contains("sk-super-secret-value-123"));
        assert_eq!(debug, "ApiKey([REDACTED])");
    }

    #[test]
    fn rejects_empty_and_whitespace_values() {
        assert!(matches!(
            ApiKey::new(String::new()),
            Err(KeyStoreError::InvalidKeyValue)
        ));
        assert!(matches!(
            ApiKey::new("   ".to_string()),
            Err(KeyStoreError::InvalidKeyValue)
        ));
    }

    #[test]
    fn rejects_control_characters() {
        assert!(matches!(
            ApiKey::new("abc\ndef".to_string()),
            Err(KeyStoreError::InvalidKeyValue)
        ));
        assert!(matches!(
            ApiKey::new("abc\rdef".to_string()),
            Err(KeyStoreError::InvalidKeyValue)
        ));
    }

    #[test]
    fn expose_returns_raw_value() {
        let key = ApiKey::new("valid-key".to_string()).unwrap();
        assert_eq!(key.expose(), "valid-key");
    }
}
