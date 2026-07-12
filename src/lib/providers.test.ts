import { describe, expect, it } from "vitest";
import {
  DEFAULT_PROVIDER_OPTION,
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
