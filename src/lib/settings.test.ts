import { beforeEach, describe, expect, it, vi } from "vitest";

const storeState = vi.hoisted(() => {
  const map = new Map<string, unknown>();
  return {
    map,
    getMock: vi.fn(async (key: string) => map.get(key)),
    setMock: vi.fn(async (key: string, value: unknown) => {
      map.set(key, value);
    }),
    saveMock: vi.fn(async () => {}),
    loadMock: vi.fn(),
  };
});

vi.mock("@tauri-apps/plugin-store", () => ({
  load: storeState.loadMock,
}));

import {
  activeModel,
  DEFAULT_PROVIDER_SETTINGS,
  loadProviderSettings,
  normalizeFallbackOrder,
  saveProviderSettings,
  type ProviderSettings,
} from "./settings";

beforeEach(() => {
  storeState.map.clear();
  storeState.getMock.mockClear();
  storeState.setMock.mockClear();
  storeState.saveMock.mockClear();
  storeState.loadMock.mockReset();
  storeState.loadMock.mockResolvedValue({
    get: storeState.getMock,
    set: storeState.setMock,
    save: storeState.saveMock,
  });
});

describe("loadProviderSettings", () => {
  it("returns defaults when nothing is persisted", async () => {
    const settings = await loadProviderSettings();
    expect(settings).toEqual(DEFAULT_PROVIDER_SETTINGS);
  });

  it("returns the persisted selection", async () => {
    const persisted: ProviderSettings = {
      defaultProvider: "openai",
      models: {
        gemini: "gemini-2.5-flash",
        anthropic: "claude-sonnet-4-5",
        openai: "gpt-5",
        openrouter: "auto",
      },
      fallbackOrder: ["openai", "gemini", "anthropic", "openrouter"],
      localOpenAi: { baseUrl: "http://127.0.0.1:1234", modelId: "local-model" },
    };
    storeState.map.set("providerSelection", persisted);
    const settings = await loadProviderSettings();
    expect(settings).toEqual(persisted);
  });

  it("falls back to defaults for a corrupt/unknown provider id", async () => {
    storeState.map.set("providerSelection", {
      defaultProvider: "not-a-provider",
      models: { gemini: 123 },
      fallbackOrder: ["nope"],
    });
    const settings = await loadProviderSettings();
    expect(settings.defaultProvider).toBe(
      DEFAULT_PROVIDER_SETTINGS.defaultProvider,
    );
    // Unknown model type is dropped; provider defaults its first model.
    expect(settings.models.gemini).toBe("gemini-2.5-flash");
    // Unknown ids are dropped from fallback order (completed to full set).
    expect(settings.fallbackOrder).toEqual(
      DEFAULT_PROVIDER_SETTINGS.fallbackOrder,
    );
    // Missing local-provider config falls back to empty defaults.
    expect(settings.localOpenAi).toEqual({ baseUrl: "", modelId: "" });
  });

  it("accepts the local OpenAI-compatible provider as the default (FR-03.CUSTOM-1)", async () => {
    storeState.map.set("providerSelection", {
      ...DEFAULT_PROVIDER_SETTINGS,
      defaultProvider: "local_openai",
      localOpenAi: { baseUrl: "http://localhost:1234", modelId: "llama-3" },
    });
    const settings = await loadProviderSettings();
    expect(settings.defaultProvider).toBe("local_openai");
    expect(settings.localOpenAi).toEqual({
      baseUrl: "http://localhost:1234",
      modelId: "llama-3",
    });
  });
});

describe("saveProviderSettings", () => {
  it("persists names only and never a key-shaped field", async () => {
    const settings: ProviderSettings = {
      defaultProvider: "gemini",
      models: { ...DEFAULT_PROVIDER_SETTINGS.models, gemini: "gemini-2.5-pro" },
      fallbackOrder: ["gemini", "openai", "anthropic", "openrouter"],
      localOpenAi: { baseUrl: "", modelId: "" },
    };
    await saveProviderSettings(settings);

    expect(storeState.setMock).toHaveBeenCalledWith(
      "providerSelection",
      expect.objectContaining({ defaultProvider: "gemini" }),
    );
    expect(storeState.saveMock).toHaveBeenCalled();

    // Guard: the serialized payload carries no key/secret-shaped field.
    const [, value] = storeState.setMock.mock.calls[0];
    const json = JSON.stringify(value).toLowerCase();
    expect(json).not.toContain("secret");
    expect(json).not.toContain("apikey");
  });

  it("normalizes the fallback order (dedupe + completes missing providers)", async () => {
    const settings: ProviderSettings = {
      ...DEFAULT_PROVIDER_SETTINGS,
      fallbackOrder: ["gemini", "gemini", "openai"] as never,
    };
    await saveProviderSettings(settings);
    const [, stored] = storeState.setMock.mock.calls[0] as [
      string,
      ProviderSettings,
    ];
    expect(stored.fallbackOrder).toEqual([
      "gemini",
      "openai",
      "anthropic",
      "openrouter",
    ]);
  });
});

describe("normalizeFallbackOrder", () => {
  it("dedupes and appends missing providers in canonical order", () => {
    expect(normalizeFallbackOrder(["openai", "openai", "bogus"])).toEqual([
      "openai",
      "gemini",
      "anthropic",
      "openrouter",
    ]);
  });
});

describe("activeModel", () => {
  it("returns the chosen model for the active provider", () => {
    expect(activeModel(DEFAULT_PROVIDER_SETTINGS)).toBe("gemini-2.5-flash");
  });

  it("returns the local provider's free-text model id when it is active", () => {
    const settings: ProviderSettings = {
      ...DEFAULT_PROVIDER_SETTINGS,
      defaultProvider: "local_openai",
      localOpenAi: { baseUrl: "http://127.0.0.1:1234", modelId: "llama-3" },
    };
    expect(activeModel(settings)).toBe("llama-3");
  });
});

describe("local OpenAI-compatible provider settings round-trip", () => {
  it("persists and reloads base_url and model id (FR-03.CUSTOM-2/3)", async () => {
    const settings: ProviderSettings = {
      ...DEFAULT_PROVIDER_SETTINGS,
      defaultProvider: "local_openai",
      localOpenAi: { baseUrl: "http://127.0.0.1:1234", modelId: "llama-3" },
    };
    await saveProviderSettings(settings);
    const reloaded = await loadProviderSettings();
    expect(reloaded.localOpenAi).toEqual({
      baseUrl: "http://127.0.0.1:1234",
      modelId: "llama-3",
    });
    expect(reloaded.defaultProvider).toBe("local_openai");
  });
});
