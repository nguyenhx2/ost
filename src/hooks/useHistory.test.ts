import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { HistoryEntry } from "../lib/history";

const mocks = vi.hoisted(() => ({
  loadHistory: vi.fn(),
  clearHistory: vi.fn().mockResolvedValue(undefined),
  copyToClipboard: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/history", () => ({
  loadHistory: mocks.loadHistory,
  clearHistory: mocks.clearHistory,
}));

vi.mock("../lib/ipc", () => ({
  copyToClipboard: mocks.copyToClipboard,
}));

import { useHistory } from "./useHistory";

function entry(over: Partial<HistoryEntry> = {}): HistoryEntry {
  return {
    id: "e1",
    sessionType: "region",
    sourceText: "Hello",
    translatedText: "Xin chao",
    sourceLanguage: "en",
    targetLanguage: "vi",
    providerId: "openai",
    modelId: "gpt-4.1-mini",
    createdAt: "2026-07-10T00:00:00.000Z",
    ...over,
  };
}

beforeEach(() => {
  mocks.loadHistory.mockReset();
  mocks.loadHistory.mockResolvedValue([entry()]);
  mocks.clearHistory.mockClear();
  mocks.copyToClipboard.mockClear();
});

describe("useHistory", () => {
  it("loads persisted entries on mount", async () => {
    const { result } = renderHook(() => useHistory());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.entries).toHaveLength(1);
    expect(result.current.entries[0].sourceText).toBe("Hello");
  });

  it("clearAll wipes the store and empties the list (AC-04.5)", async () => {
    const { result } = renderHook(() => useHistory());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.clearAll();
    });

    expect(mocks.clearHistory).toHaveBeenCalledTimes(1);
    expect(result.current.entries).toEqual([]);
  });

  it("copyEntry copies the translated text and flags the entry", async () => {
    const { result } = renderHook(() => useHistory());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.copyEntry(result.current.entries[0]);
    });

    expect(mocks.copyToClipboard).toHaveBeenCalledWith("Xin chao");
    expect(result.current.copiedId).toBe("e1");
  });
});
