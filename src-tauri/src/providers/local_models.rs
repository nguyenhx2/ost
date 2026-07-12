//! Local-model detection and generation-parameter presets for the local
//! OpenAI-compatible provider (`local_openai.rs`). Owner asked for first-class
//! support for Tencent's Hy-MT2 translation model plus Qwen3 as a
//! context/glossary/markdown model, both run by the user's own
//! OpenAI-compatible server (llama-server, LM Studio, ...) - this module never
//! launches or manages that server (see `docs/architecture/api-contracts/
//! providers.md`); it only decides WHAT to send once the user has chosen a
//! `model_id`.
//!
//! Detection is a case-insensitive substring match on the free-text
//! `model_id` the user typed or picked from a Settings preset
//! (`src/lib/providers.ts::LOCAL_MODEL_PRESETS`) - there is no catalog lookup,
//! consistent with this provider never touching a fixed model list.

/// Generation parameters sent to the OpenAI-compatible `/v1/chat/completions`
/// endpoint. `None` fields are omitted from the wire request entirely
/// (`#[serde(skip_serializing_if = "Option::is_none")]` on `WireRequest`) so
/// cloud providers - which never populate this struct - see no behavior
/// change on the wire.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct GenerationParams {
    pub temperature: f32,
    pub top_p: Option<f32>,
    pub top_k: Option<u32>,
    pub repetition_penalty: Option<f32>,
    /// Qwen3 "disable reasoning" switch (`enable_thinking: false`). `None` for
    /// every other model - the field is omitted, not sent as `true`.
    pub enable_thinking: Option<bool>,
}

impl Default for GenerationParams {
    fn default() -> Self {
        // Matches the temperature every other provider client hard-codes
        // today (openai.rs, openrouter.rs, gemini.rs, anthropic.rs) - unknown
        // local models get the same conservative default.
        Self {
            temperature: 0.2,
            top_p: None,
            top_k: None,
            repetition_penalty: None,
            enable_thinking: None,
        }
    }
}

/// True when `model_id` names a Tencent Hunyuan-MT translation model - the
/// shipped `Hunyuan-MT-7B`, or the future `Hy-MT2-*` family once llama.cpp
/// gains the `hy_v3` arch. These are translation-only models that require the
/// exact single-message prompt format in [`super::prompt`], NOT the generic
/// chat instruction/data split, and share Tencent's recommended params. Both
/// name families use the same template, so they are matched together.
pub fn is_hunyuan_mt_model(model_id: &str) -> bool {
    let id = model_id.to_lowercase();
    id.contains("hunyuan-mt") || id.contains("hy-mt2")
}

/// True when `model_id` names a Qwen3 variant - used to disable "thinking"
/// mode, which otherwise pollutes translation output with reasoning traces.
pub fn is_qwen3_model(model_id: &str) -> bool {
    model_id.to_lowercase().contains("qwen3")
}

/// Resolves the generation parameters for `model_id` (Tencent's official
/// recommendation for Hy-MT2; Qwen3 kept at the shared default temperature
/// with reasoning disabled). Every other model id - including the four cloud
/// providers, which never call this function - gets [`GenerationParams::default`].
pub fn generation_params_for_model(model_id: &str) -> GenerationParams {
    if is_hunyuan_mt_model(model_id) {
        GenerationParams {
            temperature: 0.7,
            top_p: Some(0.6),
            top_k: Some(20),
            repetition_penalty: Some(1.05),
            enable_thinking: None,
        }
    } else if is_qwen3_model(model_id) {
        GenerationParams {
            temperature: 0.2,
            top_p: None,
            top_k: None,
            repetition_penalty: None,
            enable_thinking: Some(false),
        }
    } else {
        GenerationParams::default()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hunyuan_mt_detection_is_case_insensitive_and_matches_every_preset() {
        // The shipped preset (Hunyuan-MT-7B) and the future Hy-MT2 family both
        // use Tencent's translation template, so both name forms match.
        for id in [
            "Hunyuan-MT-7B",
            "hunyuan-mt-7b",
            "Hy-MT2-7B",
            "hunyuan-mt-7b",
            "Hy-MT2-30B-A3B",
        ] {
            assert!(
                is_hunyuan_mt_model(id),
                "expected '{id}' to be a Hunyuan-MT model"
            );
        }
        assert!(!is_hunyuan_mt_model("Qwen3-14B"));
        assert!(!is_hunyuan_mt_model("llama-3-8b-instruct"));
    }

    #[test]
    fn qwen3_detection_is_case_insensitive() {
        assert!(is_qwen3_model("Qwen3-14B"));
        assert!(is_qwen3_model("qwen3-14b"));
        assert!(!is_qwen3_model("Hunyuan-MT-7B"));
    }

    #[test]
    fn hunyuan_mt_uses_tencent_recommended_generation_params() {
        let params = generation_params_for_model("Hunyuan-MT-7B");
        assert_eq!(params.temperature, 0.7);
        assert_eq!(params.top_p, Some(0.6));
        assert_eq!(params.top_k, Some(20));
        assert_eq!(params.repetition_penalty, Some(1.05));
        assert_eq!(params.enable_thinking, None);
    }

    #[test]
    fn qwen3_disables_thinking_at_the_shared_default_temperature() {
        let params = generation_params_for_model("Qwen3-14B");
        assert_eq!(params.temperature, 0.2);
        assert_eq!(params.top_p, None);
        assert_eq!(params.top_k, None);
        assert_eq!(params.repetition_penalty, None);
        assert_eq!(params.enable_thinking, Some(false));
    }

    #[test]
    fn unknown_model_falls_back_to_the_shared_default() {
        let params = generation_params_for_model("llama-3-8b-instruct");
        assert_eq!(params, GenerationParams::default());
    }
}
