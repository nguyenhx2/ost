//! Keychain backend abstraction.
//!
//! [`KeyBackend`] is the seam between the [`super::store::KeyStore`] API and
//! the real OS credential store: production uses [`KeyringBackend`] (the
//! `keyring` crate -> Windows Credential Manager, ADR-003); tests use an
//! in-memory mock. All methods are synchronous - the `keyring` crate blocks -
//! so `KeyStore` calls them through `tokio::task::spawn_blocking`.

use super::error::KeyStoreError;

/// Synchronous credential-store operations, keyed by (service, account).
pub trait KeyBackend: Send + Sync + 'static {
    /// Creates or overwrites the secret for (service, account).
    fn set_secret(&self, service: &str, account: &str, value: &str) -> Result<(), KeyStoreError>;

    /// Reads the secret for (service, account); `Ok(None)` when absent.
    fn get_secret(&self, service: &str, account: &str) -> Result<Option<String>, KeyStoreError>;

    /// Deletes the secret for (service, account). Deleting an absent entry is
    /// NOT an error (idempotent, AC-03.7).
    fn delete_secret(&self, service: &str, account: &str) -> Result<(), KeyStoreError>;
}

/// Production backend: OS keychain via the `keyring` crate (ADR-003).
/// On Windows this is the Windows Credential Manager (`windows-native` feature).
pub struct KeyringBackend;

impl KeyringBackend {
    fn entry(service: &str, account: &str) -> Result<keyring::Entry, KeyStoreError> {
        // keyring error messages describe the platform failure and never echo
        // the secret value.
        keyring::Entry::new(service, account).map_err(|e| KeyStoreError::Backend(e.to_string()))
    }
}

impl KeyBackend for KeyringBackend {
    fn set_secret(&self, service: &str, account: &str, value: &str) -> Result<(), KeyStoreError> {
        Self::entry(service, account)?
            .set_password(value)
            .map_err(|e| match e {
                // Never include the value in the error path.
                keyring::Error::TooLong(attr, max) => {
                    KeyStoreError::Backend(format!("credential attribute '{attr}' exceeds {max}"))
                }
                other => KeyStoreError::Backend(other.to_string()),
            })
    }

    fn get_secret(&self, service: &str, account: &str) -> Result<Option<String>, KeyStoreError> {
        match Self::entry(service, account)?.get_password() {
            Ok(value) => Ok(Some(value)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(KeyStoreError::Backend(e.to_string())),
        }
    }

    fn delete_secret(&self, service: &str, account: &str) -> Result<(), KeyStoreError> {
        match Self::entry(service, account)?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(KeyStoreError::Backend(e.to_string())),
        }
    }
}

#[cfg(test)]
pub(crate) mod mock {
    //! In-memory mock backends for unit tests (testing.md: keyring is mocked,
    //! the real Credential Manager round-trip is a manual smoke test).

    use std::collections::HashMap;
    use std::sync::Mutex;

    use super::*;

    /// HashMap-backed fake credential store.
    #[derive(Default)]
    pub struct MockBackend {
        entries: Mutex<HashMap<(String, String), String>>,
    }

    impl MockBackend {
        /// Test helper: dump all stored (service, account) -> value entries.
        pub fn snapshot(&self) -> HashMap<(String, String), String> {
            self.entries.lock().unwrap().clone()
        }
    }

    impl KeyBackend for MockBackend {
        fn set_secret(
            &self,
            service: &str,
            account: &str,
            value: &str,
        ) -> Result<(), KeyStoreError> {
            self.entries.lock().unwrap().insert(
                (service.to_string(), account.to_string()),
                value.to_string(),
            );
            Ok(())
        }

        fn get_secret(
            &self,
            service: &str,
            account: &str,
        ) -> Result<Option<String>, KeyStoreError> {
            Ok(self
                .entries
                .lock()
                .unwrap()
                .get(&(service.to_string(), account.to_string()))
                .cloned())
        }

        fn delete_secret(&self, service: &str, account: &str) -> Result<(), KeyStoreError> {
            self.entries
                .lock()
                .unwrap()
                .remove(&(service.to_string(), account.to_string()));
            Ok(())
        }
    }

    /// Backend that always fails, to exercise error paths.
    pub struct FailingBackend;

    impl KeyBackend for FailingBackend {
        fn set_secret(&self, _: &str, _: &str, _: &str) -> Result<(), KeyStoreError> {
            Err(KeyStoreError::Backend("simulated keychain failure".into()))
        }

        fn get_secret(&self, _: &str, _: &str) -> Result<Option<String>, KeyStoreError> {
            Err(KeyStoreError::Backend("simulated keychain failure".into()))
        }

        fn delete_secret(&self, _: &str, _: &str) -> Result<(), KeyStoreError> {
            Err(KeyStoreError::Backend("simulated keychain failure".into()))
        }
    }
}
