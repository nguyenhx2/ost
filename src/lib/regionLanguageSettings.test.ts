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
  DEFAULT_REGION_LANGUAGE_SETTINGS,
  loadRegionLanguageSettings,
  saveRegionLanguageSettings,
} from "./regionLanguageSettings";

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

describe("loadRegionLanguageSettings", () => {
  it("returns defaults (auto source, vi target) when nothing is persisted", async () => {
    const settings = await loadRegionLanguageSettings();
    expect(settings).toEqual(DEFAULT_REGION_LANGUAGE_SETTINGS);
  });

  it("returns the persisted preferences", async () => {
    storeState.map.set("regionLanguage", {
      sourceLanguage: "ja",
      targetLanguage: "en",
    });
    const settings = await loadRegionLanguageSettings();
    expect(settings).toEqual({ sourceLanguage: "ja", targetLanguage: "en" });
  });

  it("falls back to defaults for a corrupt/partial persisted value", async () => {
    storeState.map.set("regionLanguage", { sourceLanguage: 42 });
    const settings = await loadRegionLanguageSettings();
    expect(settings).toEqual(DEFAULT_REGION_LANGUAGE_SETTINGS);
  });
});

describe("saveRegionLanguageSettings", () => {
  it("persists and round-trips the preferences", async () => {
    await saveRegionLanguageSettings({
      sourceLanguage: "vi",
      targetLanguage: "ja",
    });
    expect(storeState.setMock).toHaveBeenCalledWith("regionLanguage", {
      sourceLanguage: "vi",
      targetLanguage: "ja",
    });
    expect(storeState.saveMock).toHaveBeenCalledTimes(1);

    const reloaded = await loadRegionLanguageSettings();
    expect(reloaded).toEqual({ sourceLanguage: "vi", targetLanguage: "ja" });
  });
});
