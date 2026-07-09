//! Provider API key storage in the OS keychain via the `keyring` crate (ADR-003).
//! Keys never leave this module unmasked: the WebView only ever sees
//! [`ProviderKeyStatus`] (provider name + `key_present`), and the raw value is
//! wrapped in the redacting [`ApiKey`] newtype (FR-03: AC-03.2, AC-03.3, AC-03.7).

mod api_key;
mod backend;
mod error;
mod store;

pub use api_key::ApiKey;
pub use backend::{KeyBackend, KeyringBackend};
pub use error::KeyStoreError;
pub use store::{KeyStore, ProviderKeyStatus, KEYCHAIN_SERVICE};
