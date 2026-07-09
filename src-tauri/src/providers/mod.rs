//! LLM translation providers (Gemini, Anthropic, OpenAI, OpenRouter) behind the
//! `TranslationProvider` trait - the ONLY place provider APIs are called (FR-03).
//!
//! Contract doc: `docs/architecture/api-contracts/providers.md` (update in the
//! same PR as any change here).
//!
//! Layout:
//! - [`traits`]: the shared `TranslationProvider` trait + streaming type.
//! - [`types`]: `ProviderId`, request/result/model/key-validation types.
//! - [`error`]: the typed error taxonomy (auth/quota/network/timeout/...).
//! - [`prompt`]: instruction/data-separated translation prompt (AC-03.8).
//! - [`config`]: timeout/retry policy shared by clients.
//! - [`redact`]: log/error redaction helpers (NFR-SEC-08).
//! - [`gemini`]: the Gemini client (first provider). Anthropic/OpenAI/
//!   OpenRouter are follow-up modules implementing the same trait
//!   (NFR-SCA-02: zero trait changes).

pub mod config;
pub mod error;
pub mod gemini;
pub mod prompt;
pub mod redact;
pub mod traits;
pub mod types;

pub use config::ProviderHttpConfig;
pub use error::ProviderError;
pub use gemini::GeminiClient;
pub use prompt::{build_translation_prompt, TranslationPrompt};
pub use traits::{TranslationProvider, TranslationStream};
pub use types::{
    KeyValidation, ModelInfo, ProviderId, TranslationChunk, TranslationRequest, TranslationResult,
};
