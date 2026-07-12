import { describe, expect, it } from "vitest";
import {
  DEFAULT_PROVIDER_OPTION,
  isLocalModelPresetId,
  LOCAL_MODEL_PRESET_CUSTOM,
  LOCAL_MODEL_PRESETS,
  PROVIDER_META,
  PROVIDER_META_LIST,
  PROVIDER_MODEL_OPTIONS,
} from "./providers";

describe("provider catalog - model ids must be what the provider's API accepts", () => {
  it("uses OpenRouter's namespaced auto-router id, not a bare 'auto'", () => {
    // OpenRouter model ids are namespaced (`vendor/model`); its auto-router is
    // `openrouter/auto`. A bare `auto` is rejected by the API, which surfaced
    // to the user as a generic "translation failed" with a valid key stored.
    const openrouterModels = PROVIDER_META.openrouter.models.map((m) => m.id);
    expect(openrouterModels).toContain("openrouter/auto");
    expect(openrouterModels).not.toContain("auto");

    const previewOpenrouter = PROVIDER_MODEL_OPTIONS.filter(
      (o) => o.provider === "openrouter",
    );
    for (const option of previewOpenrouter) {
      expect(option.model).not.toBe("auto");
    }
  });

  it("namespaces every OpenRouter model id", () => {
    for (const model of PROVIDER_META.openrouter.models) {
      expect(model.id).toContain("/");
    }
  });

  it("offers key validation for every provider whose client implements it", () => {
    // All four Rust clients implement `validate_key`; hiding the check button
    // in the catalog metadata left the user with no way to test a stored key.
    for (const meta of PROVIDER_META_LIST) {
      expect(meta.supportsValidation).toBe(true);
    }
  });

  it("keeps the preview default option inside the catalog", () => {
    expect(PROVIDER_MODEL_OPTIONS).toContainEqual(DEFAULT_PROVIDER_OPTION);
  });
});

describe("local model presets (Hy-MT2/Qwen3, FR-03 local-first-class)", () => {
  it("includes the three owner-named presets", () => {
    const ids = LOCAL_MODEL_PRESETS.map((p) => p.id);
    expect(ids).toEqual(["Hy-MT2-7B", "Qwen3-14B", "Hy-MT2-30B-A3B"]);
  });

  it("preset ids keep the substrings the Rust side detects by", () => {
    // src-tauri/src/providers/local_models.rs matches "hy-mt2"/"qwen3"
    // case-insensitively - a rename here without updating the Rust match (or
    // vice versa) silently breaks the Hy-MT2 prompt format / generation
    // params. Pin the invariant here.
    const hyMt2 = LOCAL_MODEL_PRESETS.filter((p) =>
      p.id.toLowerCase().includes("hy-mt2"),
    );
    const qwen3 = LOCAL_MODEL_PRESETS.filter((p) =>
      p.id.toLowerCase().includes("qwen3"),
    );
    expect(hyMt2).toHaveLength(2);
    expect(qwen3).toHaveLength(1);
  });

  it("isLocalModelPresetId recognizes only known preset ids", () => {
    expect(isLocalModelPresetId("Hy-MT2-7B")).toBe(true);
    expect(isLocalModelPresetId("some-other-model")).toBe(false);
    expect(isLocalModelPresetId(LOCAL_MODEL_PRESET_CUSTOM)).toBe(false);
  });
});
