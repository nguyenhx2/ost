//! Settings-time whisper model catalog + hardware gating (FR-01, TASK-026,
//! `docs/requirements/PRD-FR-01-stt-backend-options.md`).
//!
//! Extends the BR-08 first-run hardware-recommended default with a Settings
//! "Speech-to-text engine" picker: `tiny` / `base` (default) / `small` /
//! `large-v3-turbo`, with `large-v3` offered only when the hardware probe
//! reports a compatible CUDA GPU. `medium` is deliberately EXCLUDED from this
//! catalog (PRD section 3: no accuracy advantage over `large-v3-turbo` at a
//! similar RAM cost) even though the [`WhisperModel`] registry still carries
//! it for [`super::hardware::recommend_model`]'s dormant GPU branch.
//!
//! Every entry carries a RAM floor (`ram_floor_bytes`) so [`is_allowed`] can
//! hide/disable a tier the machine cannot afford without breaking the BR-04
//! performance budget (idle < 100MB RAM / < 1% CPU; p95 audio < 3s) - the PRD
//! left the exact MB thresholds to this implementation, so the choice is
//! documented per entry below. All logic here is pure (a [`HardwareProfile`]
//! in, a decision out) so it is unit-tested without touching real hardware or
//! disk.

use super::hardware::HardwareProfile;
use super::model::WhisperModel;

/// RAM floor for `small` (bytes): mirrors the existing CPU-latency ceiling in
/// [`super::hardware::recommend_model`], which already reserves `Small` for
/// 8 GiB+ machines - the switcher applies the same floor as a hard gate.
const RAM_FLOOR_SMALL_BYTES: u64 = 8 * 1024 * 1024 * 1024;

/// RAM floor for `large-v3-turbo` (bytes): its encoder is the same size as
/// `large-v3`'s (only the decoder is thinned to 4 layers), so its RAM/latency
/// profile is materially heavier than `small` - a 16 GiB floor keeps enough
/// headroom for the p95 < 3s budget alongside the rest of the app.
const RAM_FLOOR_LARGE_V3_TURBO_BYTES: u64 = 16 * 1024 * 1024 * 1024;

/// RAM floor for `large-v3` (bytes): same headroom reasoning as
/// `large-v3-turbo`, applied in ADDITION to the `requires_cuda` gate below -
/// a CUDA GPU offloads compute, but the host process still needs RAM for
/// buffers/activations at this size.
const RAM_FLOOR_LARGE_V3_BYTES: u64 = 16 * 1024 * 1024 * 1024;

/// One selectable tier in the Settings STT picker.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CatalogEntry {
    /// Stable IPC id (`src/lib/ipc.ts` mirrors this string), never a secret.
    pub id: &'static str,
    /// UI label (English; the frontend i18n layer owns translation - this is
    /// the stable fallback/key, not the rendered copy).
    pub label: &'static str,
    /// The registry model (filename/sizes/pinned SHA-256).
    pub model: WhisperModel,
    /// Minimum total RAM the hardware probe must report before this tier is
    /// offered (`None` = no floor: always allowed on RAM grounds).
    pub ram_floor_bytes: Option<u64>,
    /// `true` when the tier is offered ONLY when the hardware probe detects a
    /// compatible CUDA GPU (`large-v3`; FR-01.STT-2).
    pub requires_cuda: bool,
}

/// The Settings model-switcher catalog, in ascending tier order. `medium` is
/// intentionally absent (see module docs).
pub const CATALOG: [CatalogEntry; 5] = [
    CatalogEntry {
        id: "tiny",
        label: "Tiny",
        model: WhisperModel::TINY,
        ram_floor_bytes: None,
        requires_cuda: false,
    },
    CatalogEntry {
        id: "base",
        label: "Base",
        model: WhisperModel::BASE,
        ram_floor_bytes: None,
        requires_cuda: false,
    },
    CatalogEntry {
        id: "small",
        label: "Small",
        model: WhisperModel::SMALL,
        ram_floor_bytes: Some(RAM_FLOOR_SMALL_BYTES),
        requires_cuda: false,
    },
    CatalogEntry {
        id: "large-v3-turbo",
        label: "Large v3 Turbo",
        model: WhisperModel::LARGE_V3_TURBO,
        ram_floor_bytes: Some(RAM_FLOOR_LARGE_V3_TURBO_BYTES),
        requires_cuda: false,
    },
    CatalogEntry {
        id: "large-v3",
        label: "Large v3",
        model: WhisperModel::LARGE_V3,
        ram_floor_bytes: Some(RAM_FLOOR_LARGE_V3_BYTES),
        requires_cuda: true,
    },
];

/// The default/recommended tier when nothing overrides it (BR-08's original
/// first-run default remains `base` per PRD section 2).
pub const DEFAULT_ID: &str = "base";

/// Looks up a catalog entry by its stable id. `None` for an unknown id
/// (untrusted IPC input - the caller maps this to a typed error).
#[must_use]
pub fn entry_for_id(id: &str) -> Option<&'static CatalogEntry> {
    CATALOG.iter().find(|e| e.id == id)
}

/// Whether `entry` is offered on the machine described by `profile`: the RAM
/// floor (if any) must be met, and a CUDA requirement (if any) must be
/// satisfied. Pure and total - every `(entry, profile)` pair has a definite
/// answer, so this is exhaustively unit-tested without real hardware.
#[must_use]
pub fn is_allowed(entry: &CatalogEntry, profile: &HardwareProfile) -> bool {
    if entry.requires_cuda && !profile.has_gpu {
        return false;
    }
    if let Some(floor) = entry.ram_floor_bytes {
        if profile.total_ram_bytes < floor {
            return false;
        }
    }
    true
}

/// The catalog entries `profile` allows, in ascending tier order.
#[must_use]
pub fn allowed_entries(profile: &HardwareProfile) -> Vec<&'static CatalogEntry> {
    CATALOG.iter().filter(|e| is_allowed(e, profile)).collect()
}

/// Resolves the model to use at startup (or whenever the persisted Settings
/// selection needs re-validating against the current hardware): the
/// persisted `stored_id` when it names a KNOWN catalog entry the CURRENT
/// `profile` still allows; otherwise `recommended` (BR-08's original
/// hardware-recommended fallback). Pure so the precedence is unit-tested
/// without a settings store or a filesystem read.
#[must_use]
pub fn resolve_selected_model(
    stored_id: Option<&str>,
    recommended: WhisperModel,
    profile: &HardwareProfile,
) -> WhisperModel {
    match stored_id.and_then(entry_for_id) {
        Some(entry) if is_allowed(entry, profile) => entry.model,
        _ => recommended,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn profile(ram_gib: u64, has_gpu: bool) -> HardwareProfile {
        HardwareProfile {
            total_ram_bytes: ram_gib * 1024 * 1024 * 1024,
            has_gpu,
        }
    }

    #[test]
    fn catalog_excludes_medium_and_lists_five_tiers_in_order() {
        let ids: Vec<&str> = CATALOG.iter().map(|e| e.id).collect();
        assert_eq!(
            ids,
            vec!["tiny", "base", "small", "large-v3-turbo", "large-v3"]
        );
        assert!(!ids.contains(&"medium"));
    }

    #[test]
    fn entry_for_id_resolves_known_ids_and_rejects_unknown() {
        assert_eq!(
            entry_for_id("tiny").unwrap().model.size,
            WhisperModel::TINY.size
        );
        assert_eq!(
            entry_for_id("large-v3").unwrap().model.filename,
            "ggml-large-v3.bin"
        );
        assert!(entry_for_id("medium").is_none());
        assert!(entry_for_id("not-a-model").is_none());
    }

    #[test]
    fn tiny_and_base_are_always_allowed() {
        let starved = profile(1, false);
        assert!(is_allowed(entry_for_id("tiny").unwrap(), &starved));
        assert!(is_allowed(entry_for_id("base").unwrap(), &starved));
    }

    #[test]
    fn small_requires_the_ram_floor() {
        let low = profile(4, false);
        let enough = profile(8, false);
        assert!(!is_allowed(entry_for_id("small").unwrap(), &low));
        assert!(is_allowed(entry_for_id("small").unwrap(), &enough));
    }

    #[test]
    fn turbo_requires_a_higher_ram_floor_than_small() {
        let mid = profile(8, false);
        let high = profile(16, false);
        assert!(!is_allowed(entry_for_id("large-v3-turbo").unwrap(), &mid));
        assert!(is_allowed(entry_for_id("large-v3-turbo").unwrap(), &high));
    }

    #[test]
    fn large_v3_requires_cuda_regardless_of_ram() {
        let high_no_gpu = profile(32, false);
        let high_with_gpu = profile(32, true);
        let low_with_gpu = profile(2, true);
        assert!(!is_allowed(entry_for_id("large-v3").unwrap(), &high_no_gpu));
        assert!(is_allowed(
            entry_for_id("large-v3").unwrap(),
            &high_with_gpu
        ));
        // CUDA present but RAM floor unmet: still refused (both gates apply).
        assert!(!is_allowed(
            entry_for_id("large-v3").unwrap(),
            &low_with_gpu
        ));
    }

    #[test]
    fn allowed_entries_filters_the_full_catalog() {
        let low = profile(2, false);
        let ids: Vec<&str> = allowed_entries(&low).iter().map(|e| e.id).collect();
        assert_eq!(ids, vec!["tiny", "base"]);

        let high_gpu = profile(32, true);
        let ids: Vec<&str> = allowed_entries(&high_gpu).iter().map(|e| e.id).collect();
        assert_eq!(
            ids,
            vec!["tiny", "base", "small", "large-v3-turbo", "large-v3"]
        );
    }

    #[test]
    fn resolve_selected_model_prefers_a_valid_allowed_stored_choice() {
        let profile = profile(32, true);
        let recommended = WhisperModel::BASE;
        assert_eq!(
            resolve_selected_model(Some("small"), recommended, &profile).filename,
            "ggml-small.bin"
        );
    }

    #[test]
    fn resolve_selected_model_falls_back_when_stored_choice_is_unknown() {
        let profile = profile(32, true);
        let recommended = WhisperModel::BASE;
        assert_eq!(
            resolve_selected_model(Some("not-a-model"), recommended, &profile),
            recommended
        );
        assert_eq!(
            resolve_selected_model(None, recommended, &profile),
            recommended
        );
    }

    #[test]
    fn resolve_selected_model_falls_back_when_hardware_no_longer_allows_it() {
        // A prior large-v3 selection on a machine that lost its GPU (or moved
        // to a lower-RAM machine) must NOT be silently honored (BR-04).
        let profile = profile(4, false);
        let recommended = WhisperModel::TINY;
        assert_eq!(
            resolve_selected_model(Some("large-v3"), recommended, &profile),
            recommended
        );
    }
}
