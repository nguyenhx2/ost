//! Local-LLM GGUF model registry + the first-run consent descriptor
//! (ADR-006, owner decision 2026-07-12).
//!
//! The managed local translation engine (`crate::llm::server`) runs a
//! `llama-server` subprocess over a GGUF weights file. Those files are LARGE
//! (multi-GB) and are downloaded at first run into a user cache dir (never
//! committed - `.gitignore` `*.gguf`), through the SAME fail-closed consent gate
//! (`crate::models::ModelGate`) the OCR + whisper downloads use - not a second
//! gate (security-privacy.md user-confirmed-first-run-download).
//!
//! ## Model ids and prompt routing
//!
//! Each preset's [`GgufModel::id`] is ALSO the `model_id` sent to the server on
//! every translate. It is chosen to contain the substring the provider layer's
//! prompt/param router keys on (`providers::local_models::is_hy_mt2_model` /
//! `is_qwen3_model`), so a managed Hy-MT2 model gets Tencent's exact translate
//! template + generation params with no extra wiring.
//!
//! ## UNVERIFIED download sources (flagged for the owner / tech-researcher)
//!
//! The repo/filename/size fields below are BEST-EFFORT and were NOT verified
//! against a live Hugging Face repo from the offline dev environment. Before the
//! owner relies on a preset, its `repo` + `filename` must be confirmed to exist
//! and host the exact quant. A wrong URL fails CLEANLY (the download surfaces a
//! network error and writes nothing - `crate::llm::download`), so an unverified
//! entry is safe, just non-functional until corrected.
//!
//! ## Digests: record-on-first-download (trust-on-first-use), NOT pinned
//!
//! `sha256` is `None` for every preset because a real per-file digest could not
//! be verified offline (inventing one would be worse than none). The download
//! path therefore RECORDS the actual SHA-256 of the first download to a sidecar
//! file and verifies future loads against it - trust-on-first-use. This is a
//! DELIBERATE, documented weakening vs. the whisper path (which REFUSES an
//! unpinned native binary): a GGUF is loaded by the crash-isolated subprocess,
//! not in-process, and the honest options offline were TOFU or a fake pin. Once
//! the owner captures the real digests (surfaced by the first download), pin
//! them here to upgrade to the fail-closed pinned path.

use std::path::{Path, PathBuf};

use crate::models::{ModelArtifact, ModelHost, ModelSetDescriptor};

/// Consent-persistence + routing key for the whole local-LLM feature. One grant
/// enables downloading whichever preset GGUF the user confirms (all presets
/// come from the same Hugging Face host). Never a secret (names/flags only).
pub const LOCAL_LLM_MODEL_SET_ID: &str = "local-llm-gguf";

/// The Hugging Face model host. Named explicitly as an egress path the
/// security-reviewer inspects (mirrors `ModelHost::MODELSCOPE`).
pub const HUGGING_FACE: ModelHost = ModelHost {
    name: "Hugging Face",
    domain: "huggingface.co",
};

/// A downloadable local-LLM GGUF model + the flags the managed server runs it
/// with. Sizes are approximate (publisher tables); `sha256` is the recorded or
/// (future) pinned digest - see the module docs.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct GgufModel {
    /// Stable catalog id AND the `model_id` sent to the server. Chosen to carry
    /// the `hy-mt2` / `qwen3` substring the provider prompt router keys on.
    pub id: &'static str,
    /// UI label (English fallback; the frontend i18n layer owns rendered copy).
    pub label: &'static str,
    /// Hugging Face repo `owner/name` the GGUF is fetched from.
    pub repo: &'static str,
    /// The GGUF filename in the repo and on disk.
    pub filename: &'static str,
    /// Repo revision (pinned to a branch/tag/commit; `main` for now).
    pub revision: &'static str,
    /// Approximate download size in bytes (shown in the consent disclosure).
    pub approx_download_bytes: u64,
    /// Approximate resident memory the server uses with this model (BR-04
    /// guardrail context; MoE/quant estimate).
    pub approx_ram_bytes: u64,
    /// Expected content SHA-256. `None` = record-on-first-download (TOFU) - see
    /// the module docs. When `Some`, the download verifies against it
    /// fail-closed (mismatch rejects the artifact).
    pub sha256: Option<&'static str>,
    /// `--n-gpu-layers` the owner's recommended launch flags use for this model
    /// (99 = offload all layers; the manager falls back to 0/CPU on a GPU
    /// launch failure - see `crate::llm::server`).
    pub recommended_gpu_layers: i32,
    /// The first-run default preset.
    pub default: bool,
}

impl GgufModel {
    /// Tencent Hy-MT2 7B (Q4_K_M) - the translation-only default. ~4.6 GB.
    /// UNVERIFIED repo/filename (see module docs).
    pub const HY_MT2_7B: GgufModel = GgufModel {
        id: "hy-mt2-7b",
        label: "Hy-MT2 7B (Q4_K_M)",
        repo: "mradermacher/Hunyuan-MT-7B-GGUF",
        filename: "Hunyuan-MT-7B.Q4_K_M.gguf",
        revision: "main",
        approx_download_bytes: 4_600_000_000,
        approx_ram_bytes: 6_500_000_000,
        sha256: None,
        recommended_gpu_layers: 99,
        default: true,
    };

    /// Qwen3 14B (Q4_K_M) - context/glossary/markdown model. ~9 GB.
    /// UNVERIFIED repo/filename (see module docs).
    pub const QWEN3_14B: GgufModel = GgufModel {
        id: "qwen3-14b",
        label: "Qwen3 14B (Q4_K_M)",
        repo: "Qwen/Qwen3-14B-GGUF",
        filename: "Qwen3-14B-Q4_K_M.gguf",
        revision: "main",
        approx_download_bytes: 9_000_000_000,
        approx_ram_bytes: 12_000_000_000,
        sha256: None,
        recommended_gpu_layers: 99,
        default: false,
    };

    /// Hy-MT2 30B-A3B (MoE, Q4_K_M) - batch/high-quality tier. ~18 GB.
    /// UNVERIFIED repo/filename (see module docs); the owner named this preset
    /// but no confirmed public GGUF was checkable offline.
    pub const HY_MT2_30B_A3B: GgufModel = GgufModel {
        id: "hy-mt2-30b-a3b",
        label: "Hy-MT2 30B-A3B (MoE, Q4_K_M)",
        repo: "mradermacher/Hunyuan-MT-30B-A3B-GGUF",
        filename: "Hunyuan-MT-30B-A3B.Q4_K_M.gguf",
        revision: "main",
        approx_download_bytes: 18_000_000_000,
        approx_ram_bytes: 22_000_000_000,
        sha256: None,
        recommended_gpu_layers: 99,
        default: false,
    };

    /// Every preset in catalog order (default first).
    pub const CATALOG: [GgufModel; 3] = [Self::HY_MT2_7B, Self::QWEN3_14B, Self::HY_MT2_30B_A3B];

    /// The default first-run preset.
    #[must_use]
    pub fn default_model() -> GgufModel {
        Self::HY_MT2_7B
    }

    /// Looks up a preset by its stable id. `None` for an unknown id (untrusted
    /// IPC input - the caller maps this to a typed error).
    #[must_use]
    pub fn for_id(id: &str) -> Option<GgufModel> {
        Self::CATALOG.iter().copied().find(|m| m.id == id)
    }

    /// The HTTPS URL the GGUF is fetched from (`resolve/<revision>/<filename>`
    /// serves the raw LFS content, not the pointer).
    #[must_use]
    pub fn url(&self) -> String {
        format!(
            "https://huggingface.co/{}/resolve/{}/{}",
            self.repo, self.revision, self.filename
        )
    }

    /// The on-disk path of this model's GGUF under `model_dir`.
    #[must_use]
    pub fn path_in(&self, model_dir: &Path) -> PathBuf {
        model_dir.join(self.filename)
    }

    /// The sidecar path recording the trust-on-first-use digest for this model.
    #[must_use]
    pub fn digest_sidecar_in(&self, model_dir: &Path) -> PathBuf {
        model_dir.join(format!("{}.sha256", self.filename))
    }
}

/// Builds the consent disclosure descriptor for a SINGLE local-LLM model (the
/// one the user is about to download), so the disclosed total size is honest -
/// only one model is fetched at a time (mirrors the whisper descriptor).
#[must_use]
pub fn local_llm_model_set_descriptor(
    model: GgufModel,
    destination: PathBuf,
) -> ModelSetDescriptor {
    ModelSetDescriptor {
        id: LOCAL_LLM_MODEL_SET_ID,
        display_name: "Local LLM translation model (llama-server)",
        host: HUGGING_FACE,
        artifacts: vec![ModelArtifact {
            filename: model.filename,
            approx_size_bytes: model.approx_download_bytes,
            sha256: model.sha256,
        }],
        destination,
    }
}

/// Resolves the on-disk local-LLM model cache dir.
///
/// Precedence: `OST_LLM_MODEL_DIR` env var if set, else `<home>/.ost/llm`.
/// Never the repo tree - GGUFs are gitignored and live in a user cache.
#[must_use]
pub fn resolve_llm_model_dir() -> PathBuf {
    if let Some(dir) = std::env::var_os("OST_LLM_MODEL_DIR") {
        return PathBuf::from(dir);
    }
    home_dir()
        .map(|h| h.join(".ost").join("llm"))
        .unwrap_or_else(|| PathBuf::from(".ost").join("llm"))
}

/// Best-effort home directory without pulling a new dependency (mirrors
/// `crate::models` / `crate::stt::model`).
fn home_dir() -> Option<PathBuf> {
    #[cfg(windows)]
    {
        std::env::var_os("USERPROFILE").map(PathBuf::from)
    }
    #[cfg(not(windows))]
    {
        std::env::var_os("HOME").map(PathBuf::from)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn catalog_has_exactly_one_default_and_it_is_hy_mt2_7b() {
        let defaults: Vec<_> = GgufModel::CATALOG.iter().filter(|m| m.default).collect();
        assert_eq!(defaults.len(), 1);
        assert_eq!(defaults[0].id, "hy-mt2-7b");
        assert_eq!(GgufModel::default_model().id, "hy-mt2-7b");
    }

    #[test]
    fn preset_ids_carry_the_substring_the_prompt_router_keys_on() {
        // The provider prompt/param router keys on these substrings - a preset
        // whose id lost them would silently drop Hy-MT2/Qwen3 handling.
        use crate::providers::{is_hy_mt2_model, GenerationParams};
        assert!(is_hy_mt2_model(GgufModel::HY_MT2_7B.id));
        assert!(is_hy_mt2_model(GgufModel::HY_MT2_30B_A3B.id));
        // Qwen3 preset id contains qwen3 (checked via its generation params).
        assert_ne!(
            crate::providers::generation_params_for_model(GgufModel::QWEN3_14B.id),
            GenerationParams::default(),
            "qwen3 preset id must trigger the qwen3 param preset"
        );
    }

    #[test]
    fn for_id_resolves_known_ids_and_rejects_unknown() {
        assert_eq!(GgufModel::for_id("hy-mt2-7b").unwrap().id, "hy-mt2-7b");
        assert_eq!(GgufModel::for_id("qwen3-14b").unwrap().id, "qwen3-14b");
        assert!(GgufModel::for_id("not-a-model").is_none());
    }

    #[test]
    fn url_targets_hugging_face_resolve_over_https() {
        let url = GgufModel::HY_MT2_7B.url();
        assert!(url.starts_with("https://huggingface.co/"));
        assert!(url.contains("/resolve/main/"));
        assert!(url.ends_with(".gguf"));
    }

    #[test]
    fn descriptor_names_hugging_face_and_the_single_model() {
        let d = local_llm_model_set_descriptor(GgufModel::HY_MT2_7B, PathBuf::from("/cache"));
        assert_eq!(d.id, LOCAL_LLM_MODEL_SET_ID);
        assert_eq!(d.host.domain, "huggingface.co");
        assert_eq!(d.artifacts.len(), 1);
        assert_eq!(
            d.total_approx_size_bytes(),
            GgufModel::HY_MT2_7B.approx_download_bytes
        );
    }

    #[test]
    fn model_dir_honors_env_override() {
        let prev = std::env::var_os("OST_LLM_MODEL_DIR");
        std::env::set_var("OST_LLM_MODEL_DIR", "/custom/llm");
        assert_eq!(resolve_llm_model_dir(), PathBuf::from("/custom/llm"));
        match prev {
            Some(v) => std::env::set_var("OST_LLM_MODEL_DIR", v),
            None => std::env::remove_var("OST_LLM_MODEL_DIR"),
        }
    }

    #[test]
    fn paths_join_filename_and_sidecar() {
        let dir = Path::new("/cache");
        assert!(GgufModel::HY_MT2_7B
            .path_in(dir)
            .ends_with("Hunyuan-MT-7B.Q4_K_M.gguf"));
        assert!(GgufModel::HY_MT2_7B
            .digest_sidecar_in(dir)
            .ends_with("Hunyuan-MT-7B.Q4_K_M.gguf.sha256"));
    }
}
