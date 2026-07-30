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
  DEFAULT_AUDIO_SOURCE,
  loadAudioSourcePreference,
  saveAudioSourcePreference,
} from "./audioSource";

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

describe("loadAudioSourcePreference", () => {
  it("defaults to systemLoopback when nothing is persisted", async () => {
    const value = await loadAudioSourcePreference();
    expect(value).toBe(DEFAULT_AUDIO_SOURCE);
  });

  it("returns the persisted microphone preference", async () => {
    storeState.map.set("audioSource", "microphone");
    const value = await loadAudioSourcePreference();
    expect(value).toBe("microphone");
  });

  it("falls back to the default for a corrupt persisted value", async () => {
    storeState.map.set("audioSource", "garbled");
    const value = await loadAudioSourcePreference();
    expect(value).toBe(DEFAULT_AUDIO_SOURCE);
  });
});

describe("saveAudioSourcePreference", () => {
  it("persists under the SAME key the Rust core writes (ipc.md)", async () => {
    await saveAudioSourcePreference("microphone");

    expect(storeState.setMock).toHaveBeenCalledWith(
      "audioSource",
      "microphone",
    );
    expect(storeState.saveMock).toHaveBeenCalledTimes(1);
    expect(await loadAudioSourcePreference()).toBe("microphone");
  });
});
