//! The shared `TranslationProvider` trait - the ONLY surface through which the
//! audio (FR-01) and screen (FR-02) pipelines talk to LLM providers (FR-03).
//!
//! Stability contract (NFR-SCA-02): adding Anthropic/OpenAI/OpenRouter later
//! means adding a module that implements this trait - zero trait changes and
//! zero call-site changes.

use std::pin::Pin;

use async_trait::async_trait;
use tokio_stream::Stream;

use super::error::ProviderError;
use super::types::{
    KeyValidation, ModelInfo, ProviderId, TranslationChunk, TranslationRequest, TranslationResult,
};
use crate::keys::ApiKey;

/// Streaming translation output: an ordered stream of text deltas.
pub type TranslationStream =
    Pin<Box<dyn Stream<Item = Result<TranslationChunk, ProviderError>> + Send>>;

/// One LLM provider client. Implementations own all HTTP specifics; nothing
/// outside `src-tauri/src/providers/` speaks HTTP to a provider.
///
/// Keys are passed per call as [`ApiKey`] (retrieved from
/// [`crate::keys::KeyStore`] by the caller in the Rust core); implementations
/// must put them in headers only and redact every provider-derived message.
#[async_trait]
pub trait TranslationProvider: Send + Sync {
    /// Which provider this client is.
    fn id(&self) -> ProviderId;

    /// Translates `request.text` and returns the full result at once.
    async fn translate(
        &self,
        request: &TranslationRequest,
        key: &ApiKey,
    ) -> Result<TranslationResult, ProviderError>;

    /// Translates `request.text`, yielding text deltas as they arrive.
    async fn translate_stream(
        &self,
        request: &TranslationRequest,
        key: &ApiKey,
    ) -> Result<TranslationStream, ProviderError>;

    /// Models the user can pick for this provider. `key` is accepted because
    /// some providers require auth to list models; implementations may ignore
    /// it (the Gemini client currently serves a pinned list - see
    /// `docs/architecture/api-contracts/providers.md`).
    async fn list_models(&self, key: Option<&ApiKey>) -> Result<Vec<ModelInfo>, ProviderError>;

    /// User-triggered key check (AC-03.4): performs EXACTLY ONE minimal
    /// provider call (no retries) and returns a typed valid/invalid outcome.
    /// Transport-level failures (network/timeout) are `Err`, not `Invalid`.
    async fn validate_key(&self, key: &ApiKey) -> Result<KeyValidation, ProviderError>;
}
