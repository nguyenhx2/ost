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
  clearHistory,
  HISTORY_ENABLED_DEFAULT,
  isHistoryEnabled,
  loadHistory,
  MAX_HISTORY_ENTRIES,
  recordTranslation,
  setHistoryEnabled,
  type HistoryEntry,
  type RecordInput,
} from "./history";

const SAMPLE: RecordInput = {
  sessionType: "region",
  sourceText: "Hello world",
  translatedText: "Xin chao the gioi",
  sourceLanguage: "en",
  targetLanguage: "vi",
  providerId: "openai",
  modelId: "gpt-4.1-mini",
};

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

describe("isHistoryEnabled", () => {
  it("is ON by default (BR-06) when nothing is persisted", async () => {
    expect(HISTORY_ENABLED_DEFAULT).toBe(true);
    await expect(isHistoryEnabled()).resolves.toBe(true);
  });

  it("reflects a persisted false flag", async () => {
    storeState.map.set("enabled", false);
    await expect(isHistoryEnabled()).resolves.toBe(false);
  });
});

describe("recordTranslation (AC-04.4)", () => {
  it("records exactly the text-only HISTORY_ENTRY field set", async () => {
    const entry = await recordTranslation(SAMPLE);
    expect(entry).not.toBeNull();

    // The stored array carries one entry with the exact field set - no more.
    const [, stored] = storeState.setMock.mock.calls[0] as [
      string,
      HistoryEntry[],
    ];
    expect(stored).toHaveLength(1);
    expect(Object.keys(stored[0]).sort()).toEqual(
      [
        "createdAt",
        "id",
        "modelId",
        "providerId",
        "sessionType",
        "sourceLanguage",
        "sourceText",
        "targetLanguage",
        "translatedText",
      ].sort(),
    );
    expect(stored[0]).toMatchObject({
      sessionType: "region",
      sourceText: "Hello world",
      translatedText: "Xin chao the gioi",
      sourceLanguage: "en",
      targetLanguage: "vi",
      providerId: "openai",
      modelId: "gpt-4.1-mini",
    });
    expect(stored[0].id).toBeTypeOf("string");
    expect(stored[0].createdAt).toBeTypeOf("string");
    expect(storeState.saveMock).toHaveBeenCalled();
  });

  it("drops any smuggled key/audio/screenshot field (text-only gate)", async () => {
    // A hostile/careless caller passes secrets alongside the real fields; the
    // whitelist in toEntry must strip everything not in HISTORY_ENTRY.
    const dirty = {
      ...SAMPLE,
      apiKey: "sk-super-secret-value",
      audioBuffer: [1, 2, 3, 4],
      screenshot: "data:image/png;base64,AAAA",
      secret: "leak",
    } as unknown as RecordInput;

    await recordTranslation(dirty);

    const [, stored] = storeState.setMock.mock.calls[0] as [
      string,
      HistoryEntry[],
    ];
    const json = JSON.stringify(stored).toLowerCase();
    expect(json).not.toContain("apikey");
    expect(json).not.toContain("sk-super-secret");
    expect(json).not.toContain("audiobuffer");
    expect(json).not.toContain("screenshot");
    expect(json).not.toContain("secret");
    expect(stored[0]).not.toHaveProperty("apiKey");
    expect(stored[0]).not.toHaveProperty("audioBuffer");
    expect(stored[0]).not.toHaveProperty("screenshot");
  });

  it("prepends newest first and preserves earlier entries", async () => {
    await recordTranslation({ ...SAMPLE, sourceText: "first" });
    await recordTranslation({ ...SAMPLE, sourceText: "second" });

    const entries = await loadHistory();
    expect(entries.map((e) => e.sourceText)).toEqual(["second", "first"]);
  });

  it("caps the store at MAX_HISTORY_ENTRIES, dropping the oldest", async () => {
    const full: HistoryEntry[] = Array.from(
      { length: MAX_HISTORY_ENTRIES },
      (_, i) => ({
        id: `old-${i}`,
        sessionType: "region",
        sourceText: `old-${i}`,
        translatedText: "",
        sourceLanguage: "en",
        targetLanguage: "vi",
        providerId: "openai",
        modelId: "gpt-4.1-mini",
        createdAt: "2026-07-10T00:00:00.000Z",
      }),
    );
    storeState.map.set("entries", full);

    await recordTranslation({ ...SAMPLE, sourceText: "newest" });

    const [, stored] = storeState.setMock.mock.calls[0] as [
      string,
      HistoryEntry[],
    ];
    expect(stored).toHaveLength(MAX_HISTORY_ENTRIES);
    expect(stored[0].sourceText).toBe("newest");
    expect(stored.some((e) => e.id === `old-${MAX_HISTORY_ENTRIES - 1}`)).toBe(
      false,
    );
  });

  it("serializes concurrent records so neither entry is dropped (atomic write)", async () => {
    // TASK-018 follow-up: a region completion and an audio completion can fire
    // at nearly the same time. `store.get`/`set` are async yield points; the
    // read-modify-write MUST be serialized or the second `set` clobbers the
    // first. We make the mocked get/set yield (a microtask) so an unserialized
    // implementation would interleave and drop one; the serialized chain keeps
    // both. `map` starts empty.
    storeState.getMock.mockImplementation(async (key: string) => {
      await Promise.resolve();
      return storeState.map.get(key);
    });
    storeState.setMock.mockImplementation(
      async (key: string, value: unknown) => {
        await Promise.resolve();
        storeState.map.set(key, value);
      },
    );

    // Fire both WITHOUT awaiting between them: concurrent record-modify-write.
    const [a, b] = await Promise.all([
      recordTranslation({ ...SAMPLE, sessionType: "region", sourceText: "R" }),
      recordTranslation({ ...SAMPLE, sessionType: "audio", sourceText: "A" }),
    ]);

    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    const entries = await loadHistory();
    // Both survived - neither completion dropped the other's entry.
    expect(entries).toHaveLength(2);
    expect(entries.map((e) => e.sourceText).sort()).toEqual(["A", "R"]);
    // And both session types are represented (region + audio), text-only.
    expect(entries.map((e) => e.sessionType).sort()).toEqual([
      "audio",
      "region",
    ]);
  });

  it("does NOT record while history is disabled (AC-04.6)", async () => {
    storeState.map.set("enabled", false);
    const entry = await recordTranslation(SAMPLE);
    expect(entry).toBeNull();
    expect(storeState.setMock).not.toHaveBeenCalledWith(
      "entries",
      expect.anything(),
    );
  });

  it("resumes recording after re-enabling (AC-04.6)", async () => {
    storeState.map.set("enabled", false);
    await recordTranslation(SAMPLE);
    expect(await loadHistory()).toHaveLength(0);

    await setHistoryEnabled(true);
    await recordTranslation(SAMPLE);
    expect(await loadHistory()).toHaveLength(1);
  });
});

describe("setHistoryEnabled (AC-04.6)", () => {
  it("persists the toggle and is readable back", async () => {
    await setHistoryEnabled(false);
    expect(storeState.setMock).toHaveBeenCalledWith("enabled", false);
    expect(storeState.saveMock).toHaveBeenCalled();
    await expect(isHistoryEnabled()).resolves.toBe(false);
  });
});

describe("clearHistory (AC-04.5)", () => {
  it("empties the entire store", async () => {
    await recordTranslation(SAMPLE);
    await recordTranslation(SAMPLE);
    expect(await loadHistory()).toHaveLength(2);

    await clearHistory();
    expect(storeState.setMock).toHaveBeenLastCalledWith("entries", []);
    expect(await loadHistory()).toHaveLength(0);
  });
});

describe("loadHistory", () => {
  it("returns [] when nothing is persisted", async () => {
    await expect(loadHistory()).resolves.toEqual([]);
  });

  it("drops corrupt rows (missing id or bad session type)", async () => {
    storeState.map.set("entries", [
      { id: "ok", sessionType: "region", sourceText: "keep" },
      { sessionType: "region", sourceText: "no id" },
      { id: "bad", sessionType: "video", sourceText: "bad type" },
      "not an object",
    ]);
    const entries = await loadHistory();
    expect(entries).toHaveLength(1);
    expect(entries[0].sourceText).toBe("keep");
  });
});
