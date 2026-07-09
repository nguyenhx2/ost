//! Typed errors for the key storage layer.
//!
//! Invariant (AC-03.2, NFR-SEC-01): no variant carries or formats a key value.
//! Backend errors are wrapped as plain description strings produced by the
//! backend library (which never echoes the secret) - never by interpolating
//! the key.

use crate::providers::ProviderId;

/// Errors from the OS keychain wrapper. Key values never appear in any variant.
#[derive(Debug, thiserror::Error)]
pub enum KeyStoreError {
    /// No key is stored for the given provider.
    #[error("no API key stored for provider '{0}'")]
    NotFound(ProviderId),

    /// The supplied key value is empty or contains illegal characters.
    #[error("API key value is empty or invalid")]
    InvalidKeyValue,

    /// The OS keychain backend failed. The message describes the backend
    /// failure only; it never contains key material.
    #[error("OS keychain error: {0}")]
    Backend(String),
}
