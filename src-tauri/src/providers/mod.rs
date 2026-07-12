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
//! - [`factory`]: `ProviderId` -> concrete client (AC-03.1/AC-03.6).
//! - [`gemini`], [`anthropic`], [`openai`], [`openrouter`]: one client module
//!   per provider, each implementing the same trait with zero trait changes
//!   (NFR-SCA-02).
//! - [`local_openai`]: the user-hosted, loopback-only OpenAI-compatible
//!   provider (e.g. LM Studio, llama-server, FR-03.CUSTOM-1) - identifies by
//!   `base_url` instead of an API key; never touches the OS keychain.
//! - [`local_models`]: local-model detection (Hy-MT2, Qwen3) and their
//!   generation-parameter presets, used only by `local_openai`.

pub mod anthropic;
pub mod config;
pub mod error;
pub mod factory;
pub mod gemini;
pub mod local_models;
pub mod local_openai;
pub mod openai;
pub mod openrouter;
pub mod prompt;
pub mod redact;
pub mod traits;
pub mod types;

pub use anthropic::AnthropicClient;
pub use config::ProviderHttpConfig;
pub use error::ProviderError;
pub use factory::{build_local_openai_provider, build_provider};
pub use gemini::GeminiClient;
pub use local_models::{generation_params_for_model, is_hy_mt2_model, GenerationParams};
pub use local_openai::LocalOpenAiClient;
pub use openai::OpenAiClient;
pub use openrouter::OpenRouterClient;
pub use prompt::{build_translation_prompt, TranslationPrompt};
pub use traits::{TranslationProvider, TranslationStream};
pub use types::{
    KeyValidation, ModelInfo, ProviderId, ProviderMetadata, TranslationChunk, TranslationRequest,
    TranslationResult,
};
