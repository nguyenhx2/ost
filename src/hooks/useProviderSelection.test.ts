import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  loadProviderSettings: vi.fn(),
  saveProviderSettings: vi.fn(),
}));

vi.mock("../lib/settings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/settings")>();
  return {
    ...actual,
    loadProviderSettings: mocks.loadProviderSettings,
    saveProviderSettings: mocks.saveProviderSettings,
  };
});

import { DEFAULT_PROVIDER_SETTINGS } from "../lib/settings";
import { useProviderSelection } from "./useProviderSelection";

beforeEach(() => {
  mocks.loadProviderSettings
    .mockReset()
    .mockResolvedValue({ ...DEFAULT_PROVIDER_SETTINGS });
  mocks.saveProviderSettings.mockReset().mockResolvedValue(undefined);
});

describe("useProviderSelection", () => {
  it("loads persisted settings on mount", async () => {
    const { result } = renderHook(() => useProviderSelection());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.settings.defaultProvider).toBe("gemini");
  });

  it("switching provider persists the new active provider", async () => {
    const { result } = renderHook(() => useProviderSelection());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.setDefaultProvider("openai");
    });

    expect(result.current.settings.defaultProvider).toBe("openai");
    expect(mocks.saveProviderSettings).toHaveBeenCalledWith(
      expect.objectContaining({ defaultProvider: "openai" }),
    );
  });

  it("choosing a provider model persists names only", async () => {
    const { result } = renderHook(() => useProviderSelection());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.setProviderModel("gemini", "gemini-2.5-pro");
    });
    expect(result.current.settings.models.gemini).toBe("gemini-2.5-pro");
    expect(mocks.saveProviderSettings).toHaveBeenCalled();
  });

  it("moves a provider up in the fallback order and persists (AC-03.6)", async () => {
    const { result } = renderHook(() => useProviderSelection());
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Default order: gemini, anthropic, openai, openrouter. Move index 2 up.
    await act(async () => {
      await result.current.moveFallback(2, "up");
    });
    expect(result.current.settings.fallbackOrder).toEqual([
      "gemini",
      "openai",
      "anthropic",
      "openrouter",
    ]);
  });

  it("surfaces a typed error when persistence fails and does not reject", async () => {
    mocks.saveProviderSettings.mockRejectedValueOnce(
      new Error("store write failed"),
    );
    const { result } = renderHook(() => useProviderSelection());
    await waitFor(() => expect(result.current.loading).toBe(false));

    // The mutation must resolve (rejection is caught internally, so no
    // unhandled rejection escapes) and the failure is surfaced as state.
    await act(async () => {
      await expect(
        result.current.setDefaultProvider("openai"),
      ).resolves.toBeUndefined();
    });

    expect(result.current.error).toEqual({ kind: "persist" });

    // A subsequent successful mutation clears the error.
    await act(async () => {
      await result.current.setDefaultProvider("anthropic");
    });
    expect(result.current.error).toBeNull();
  });

  it("switching to the local provider persists it as the default (FR-03.CUSTOM-1)", async () => {
    const { result } = renderHook(() => useProviderSelection());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.setDefaultProvider("local_openai");
    });

    expect(result.current.settings.defaultProvider).toBe("local_openai");
    expect(mocks.saveProviderSettings).toHaveBeenCalledWith(
      expect.objectContaining({ defaultProvider: "local_openai" }),
    );
  });

  it("persists the local provider's base_url and model id", async () => {
    const { result } = renderHook(() => useProviderSelection());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.setLocalOpenAiBaseUrl("http://127.0.0.1:1234");
    });
    await act(async () => {
      await result.current.setLocalOpenAiModelId("llama-3");
    });

    expect(result.current.settings.localOpenAi).toEqual({
      baseUrl: "http://127.0.0.1:1234",
      modelId: "llama-3",
    });
    expect(mocks.saveProviderSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        localOpenAi: { baseUrl: "http://127.0.0.1:1234", modelId: "llama-3" },
      }),
    );
  });

  it("ignores an out-of-range move", async () => {
    const { result } = renderHook(() => useProviderSelection());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.moveFallback(0, "up");
    });
    expect(result.current.settings.fallbackOrder).toEqual(
      DEFAULT_PROVIDER_SETTINGS.fallbackOrder,
    );
    expect(mocks.saveProviderSettings).not.toHaveBeenCalled();
  });
});
