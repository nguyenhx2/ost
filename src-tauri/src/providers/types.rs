//! Shared data types of the provider layer (FR-03, data model 08).

use serde::{Deserialize, Serialize};

/// The four supported providers (spec 08-data-model: `provider_id`).
/// Serde strings are frozen: `"gemini" | "anthropic" | "openai" | "openrouter"`.
/// Only Gemini has a client in TASK-006; the others are follow-up modules that
/// implement [`super::TranslationProvider`] with zero trait changes (NFR-SCA-02).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ProviderId {
    Gemini,
    Anthropic,
    OpenAI,
    OpenRouter,
}

impl ProviderId {
    /// All providers in canonical order (Settings listing, AC-03.1 backend).
    pub const ALL: [ProviderId; 4] = [
        ProviderId::Gemini,
        ProviderId::Anthropic,
        ProviderId::OpenAI,
        ProviderId::OpenRouter,
    ];

    /// The frozen serde string for this provider.
    pub fn as_str(self) -> &'static str {
        match self {
            ProviderId::Gemini => "gemini",
            ProviderId::Anthropic => "anthropic",
            ProviderId::OpenAI => "openai",
            ProviderId::OpenRouter => "openrouter",
        }
    }
}

impl std::fmt::Display for ProviderId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}

impl std::str::FromStr for ProviderId {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "gemini" => Ok(ProviderId::Gemini),
            "anthropic" => Ok(ProviderId::Anthropic),
            "openai" => Ok(ProviderId::OpenAI),
            "openrouter" => Ok(ProviderId::OpenRouter),
            other => Err(format!("unknown provider id '{other}'")),
        }
    }
}

/// One translation request. `text` is UNTRUSTED DATA (STT/OCR capture) and is
/// only ever placed in the data slot of the prompt template (AC-03.8).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TranslationRequest {
    /// Opaque model identifier chosen by the user (no default baked in).
    pub model_id: String,
    /// ISO 639-1 source language; `None` = auto-detected upstream / unknown.
    pub source_language: Option<String>,
    /// ISO 639-1 target language.
    pub target_language: String,
    /// The untrusted captured text to translate.
    pub text: String,
}

/// A completed translation. Carries the provider/model that actually produced
/// it so the UI badge is always truthful (data model, AC-03.5 groundwork).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct TranslationResult {
    pub provider_id: ProviderId,
    pub model_id: String,
    /// Plain text only - the UI renders it without any markup interpretation.
    pub translated_text: String,
}

/// One incremental piece of a streaming translation.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TranslationChunk {
    /// Text appended by this chunk (may be empty for keep-alive events).
    pub text_delta: String,
}

/// A model a provider can translate with. `id` is the opaque `model_id`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ModelInfo {
    pub id: String,
    pub display_name: String,
}

/// Typed outcome of the user-triggered key check (AC-03.4). `reason` is
/// redacted, human-readable, and never contains key material.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "status", rename_all = "lowercase")]
pub enum KeyValidation {
    Valid,
    Invalid { reason: String },
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn provider_id_serde_strings_are_frozen() {
        // Spec 08-data-model: exact strings.
        let cases = [
            (ProviderId::Gemini, "\"gemini\""),
            (ProviderId::Anthropic, "\"anthropic\""),
            (ProviderId::OpenAI, "\"openai\""),
            (ProviderId::OpenRouter, "\"openrouter\""),
        ];
        for (id, json) in cases {
            assert_eq!(serde_json::to_string(&id).unwrap(), json);
            let back: ProviderId = serde_json::from_str(json).unwrap();
            assert_eq!(back, id);
        }
    }

    #[test]
    fn provider_id_from_str_round_trips() {
        for id in ProviderId::ALL {
            assert_eq!(id.as_str().parse::<ProviderId>().unwrap(), id);
        }
        assert!("claude".parse::<ProviderId>().is_err());
    }

    #[test]
    fn translation_result_carries_provider_and_model() {
        let result = TranslationResult {
            provider_id: ProviderId::Gemini,
            model_id: "gemini-2.5-flash".into(),
            translated_text: "Xin chào".into(),
        };
        let json = serde_json::to_value(&result).unwrap();
        assert_eq!(json["provider_id"], "gemini");
        assert_eq!(json["model_id"], "gemini-2.5-flash");
    }
}
