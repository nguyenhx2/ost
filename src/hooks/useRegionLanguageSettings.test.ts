import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  loadRegionLanguageSettings: vi.fn(),
  saveRegionLanguageSettings: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/regionLanguageSettings", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../lib/regionLanguageSettings")>();
  return {
    ...actual,
    loadRegionLanguageSettings: mocks.loadRegionLanguageSettings,
    saveRegionLanguageSettings: mocks.saveRegionLanguageSettings,
  };
});

import { DEFAULT_REGION_LANGUAGE_SETTINGS } from "../lib/regionLanguageSettings";
import { useRegionLanguageSettings } from "./useRegionLanguageSettings";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.saveRegionLanguageSettings.mockResolvedValue(undefined);
});

describe("useRegionLanguageSettings (item 3, home screen pickers)", () => {
  it("loads the persisted preference on mount", async () => {
    mocks.loadRegionLanguageSettings.mockResolvedValue({
      sourceLanguage: "ja",
      targetLanguage: "en",
    });
    const { result } = renderHook(() => useRegionLanguageSettings());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.settings).toEqual({
      sourceLanguage: "ja",
      targetLanguage: "en",
    });
  });

  it("falls back to defaults when the store is unreadable", async () => {
    mocks.loadRegionLanguageSettings.mockRejectedValue(new Error("nope"));
    const { result } = renderHook(() => useRegionLanguageSettings());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.settings).toEqual(DEFAULT_REGION_LANGUAGE_SETTINGS);
  });

  it("setSourceLanguage updates state and persists immediately", async () => {
    mocks.loadRegionLanguageSettings.mockResolvedValue(
      DEFAULT_REGION_LANGUAGE_SETTINGS,
    );
    const { result } = renderHook(() => useRegionLanguageSettings());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.setSourceLanguage("vi"));

    expect(result.current.settings.sourceLanguage).toBe("vi");
    expect(mocks.saveRegionLanguageSettings).toHaveBeenCalledWith(
      expect.objectContaining({ sourceLanguage: "vi" }),
    );
  });

  it("setTargetLanguage updates state and persists immediately", async () => {
    mocks.loadRegionLanguageSettings.mockResolvedValue(
      DEFAULT_REGION_LANGUAGE_SETTINGS,
    );
    const { result } = renderHook(() => useRegionLanguageSettings());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.setTargetLanguage("ja"));

    expect(result.current.settings.targetLanguage).toBe("ja");
    expect(mocks.saveRegionLanguageSettings).toHaveBeenCalledWith(
      expect.objectContaining({ targetLanguage: "ja" }),
    );
  });
});
