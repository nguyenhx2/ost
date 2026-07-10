import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type {
  OcrResultPayload,
  TranslationErrorPayload,
  TranslationResultPayload,
} from "../lib/ipc";

const mocks = vi.hoisted(() => {
  const handlers = new Map<string, (payload: unknown) => void>();
  return {
    handlers,
    regionIpc: {
      startSelection: vi.fn().mockResolvedValue(undefined),
      cancelSelection: vi.fn().mockResolvedValue(undefined),
      confirmSelection: vi.fn().mockResolvedValue(undefined),
      previewReady: vi.fn().mockResolvedValue(undefined),
      requestTranslation: vi.fn().mockResolvedValue(undefined),
      setLiveUpdate: vi.fn().mockResolvedValue(undefined),
      closePreview: vi.fn().mockResolvedValue(undefined),
      nudgePreview: vi.fn().mockResolvedValue(undefined),
    },
    listenIpc: vi.fn((event: string, handler: (payload: unknown) => void) => {
      handlers.set(event, handler);
      return Promise.resolve(() => handlers.delete(event));
    }),
    copyToClipboard: vi.fn().mockResolvedValue(undefined),
    recordTranslation: vi.fn().mockResolvedValue(null),
  };
});

vi.mock("../lib/ipc", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/ipc")>();
  return {
    ...actual,
    regionIpc: mocks.regionIpc,
    listenIpc: mocks.listenIpc,
    copyToClipboard: mocks.copyToClipboard,
  };
});

vi.mock("../lib/history", () => ({
  recordTranslation: mocks.recordTranslation,
}));

import {
  EVENT_REGION_OCR_RESULT,
  EVENT_REGION_TRANSLATION_ERROR,
  EVENT_REGION_TRANSLATION_RESULT,
} from "../lib/ipc";
import { useRegionPreview } from "./useRegionPreview";

function emitOcr(payload: OcrResultPayload) {
  act(() => {
    mocks.handlers.get(EVENT_REGION_OCR_RESULT)?.(payload);
  });
}

function emitTranslation(payload: TranslationResultPayload) {
  act(() => {
    mocks.handlers.get(EVENT_REGION_TRANSLATION_RESULT)?.(payload);
  });
}

function emitTranslationError(payload: TranslationErrorPayload) {
  act(() => {
    mocks.handlers.get(EVENT_REGION_TRANSLATION_ERROR)?.(payload);
  });
}

async function renderPreview() {
  const rendered = renderHook(() => useRegionPreview());
  // The handshake guarantees listeners are attached before events flow.
  await waitFor(() => expect(mocks.regionIpc.previewReady).toHaveBeenCalled());
  return rendered;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.handlers.clear();
});

describe("useRegionPreview - two-phase rendering (AC-02.3)", () => {
  it("shows the source text immediately on the OCR event, before translation", async () => {
    const { result } = await renderPreview();

    expect(result.current.state.status).toBe("waitingOcr");

    emitOcr({
      requestId: "p1",
      sourceText: "Hello world",
      lowConfidence: false,
    });

    expect(result.current.state.sourceText).toBe("Hello world");
    expect(result.current.state.status).toBe("translating");
    expect(result.current.state.translation).toBeNull();
  });

  it("fills the translation in from its own event", async () => {
    const { result } = await renderPreview();

    emitOcr({
      requestId: "p1",
      sourceText: "Hello world",
      lowConfidence: false,
    });

    const request = mocks.regionIpc.requestTranslation.mock.calls[0][0];
    emitTranslation({
      requestId: request.requestId,
      translatedText: "Xin chào thế giới",
      provider: "gemini",
      model: "gemini-2.5-flash",
    });

    expect(result.current.state.status).toBe("translated");
    expect(result.current.state.translation).toBe("Xin chào thế giới");
    expect(result.current.state.provider).toBe("gemini");
    expect(result.current.state.model).toBe("gemini-2.5-flash");
  });

  it("ignores stale translation events from superseded requests", async () => {
    const { result } = await renderPreview();

    emitOcr({ requestId: "p1", sourceText: "Hello", lowConfidence: false });
    emitTranslation({
      requestId: "not-the-current-request",
      translatedText: "stale",
      provider: "gemini",
      model: "m",
    });

    expect(result.current.state.translation).toBeNull();
    expect(result.current.state.status).toBe("translating");
  });
});

describe("useRegionPreview - history recording seam (BR-06/AC-04.4)", () => {
  it("records the completed translation with text-only HISTORY_ENTRY fields", async () => {
    await renderPreview();

    emitOcr({
      requestId: "p1",
      sourceText: "Hello world",
      lowConfidence: false,
      detectedLanguage: "en",
    });
    const request = mocks.regionIpc.requestTranslation.mock.calls[0][0];
    emitTranslation({
      requestId: request.requestId,
      translatedText: "Xin chào thế giới",
      provider: "gemini",
      model: "gemini-2.5-flash",
    });

    expect(mocks.recordTranslation).toHaveBeenCalledTimes(1);
    const recorded = mocks.recordTranslation.mock.calls[0][0];
    expect(recorded).toEqual({
      sessionType: "region",
      sourceText: "Hello world",
      translatedText: "Xin chào thế giới",
      sourceLanguage: "en",
      targetLanguage: "vi",
      providerId: "gemini",
      modelId: "gemini-2.5-flash",
    });
    // No key/audio/screenshot fields cross the recording seam.
    const json = JSON.stringify(recorded).toLowerCase();
    expect(json).not.toContain("key");
    expect(json).not.toContain("audio");
    expect(json).not.toContain("screenshot");
  });

  it("does NOT record when the translation fails (nothing completed)", async () => {
    await renderPreview();

    emitOcr({ requestId: "p1", sourceText: "Hello", lowConfidence: false });
    const request = mocks.regionIpc.requestTranslation.mock.calls[0][0];
    emitTranslationError({ requestId: request.requestId });

    expect(mocks.recordTranslation).not.toHaveBeenCalled();
  });
});

describe("useRegionPreview - empty OCR (AC-02.7)", () => {
  it("enters the empty state and NEVER sends a translate request", async () => {
    const { result } = await renderPreview();

    emitOcr({ requestId: "p1", sourceText: "   \n ", lowConfidence: false });

    expect(result.current.state.status).toBe("empty");
    expect(mocks.regionIpc.requestTranslation).not.toHaveBeenCalled();
  });

  it("retranslate is a no-op while empty", async () => {
    const { result } = await renderPreview();

    emitOcr({ requestId: "p1", sourceText: "", lowConfidence: false });
    act(() => result.current.retranslate());

    expect(mocks.regionIpc.requestTranslation).not.toHaveBeenCalled();
  });
});

describe("useRegionPreview - low confidence flag (AC-02.6)", () => {
  it("renders the pipeline-provided flag without applying any threshold", async () => {
    const { result } = await renderPreview();

    emitOcr({
      requestId: "p1",
      sourceText: "blurry text",
      lowConfidence: true,
    });

    expect(result.current.state.lowConfidence).toBe(true);
  });
});

describe("useRegionPreview - re-translate (AC-02.8)", () => {
  it("resends the current OCR text with the newly selected provider/model", async () => {
    const { result } = await renderPreview();

    emitOcr({ requestId: "p1", sourceText: "Hello", lowConfidence: false });
    expect(mocks.regionIpc.requestTranslation).toHaveBeenCalledTimes(1);

    const anthropic = {
      id: "anthropic/claude-sonnet-4-5",
      provider: "anthropic",
      model: "claude-sonnet-4-5",
    };
    act(() => result.current.setOption(anthropic));
    act(() => result.current.retranslate());

    expect(mocks.regionIpc.requestTranslation).toHaveBeenCalledTimes(2);
    const second = mocks.regionIpc.requestTranslation.mock.calls[1][0];
    expect(second.sourceText).toBe("Hello");
    expect(second.provider).toBe("anthropic");
    expect(second.model).toBe("claude-sonnet-4-5");
    expect(result.current.state.status).toBe("translating");
  });
});

describe("useRegionPreview - translation failure (human-in-the-loop, BR-05)", () => {
  it("moves to the failed state on a translation-error event", async () => {
    const { result } = await renderPreview();

    emitOcr({ requestId: "p1", sourceText: "Hello", lowConfidence: false });
    const request = mocks.regionIpc.requestTranslation.mock.calls[0][0];
    emitTranslationError({
      requestId: request.requestId,
      message: "provider returned 503",
    });

    expect(result.current.state.status).toBe("failed");
    expect(result.current.state.failureReason).toBe("error");
    expect(result.current.state.translation).toBeNull();
  });

  it("ignores a stale translation-error from a superseded request", async () => {
    const { result } = await renderPreview();

    emitOcr({ requestId: "p1", sourceText: "Hello", lowConfidence: false });
    emitTranslationError({ requestId: "not-the-current-request" });

    expect(result.current.state.status).toBe("translating");
    expect(result.current.state.failureReason).toBeNull();
  });

  it("re-translate recovers from the failed state (escape hatch)", async () => {
    const { result } = await renderPreview();

    emitOcr({ requestId: "p1", sourceText: "Hello", lowConfidence: false });
    const request = mocks.regionIpc.requestTranslation.mock.calls[0][0];
    emitTranslationError({ requestId: request.requestId });
    expect(result.current.state.status).toBe("failed");

    act(() => result.current.retranslate());
    expect(result.current.state.status).toBe("translating");
    expect(result.current.state.failureReason).toBeNull();
  });

  it("does not fail a request whose result already arrived", async () => {
    const { result } = await renderPreview();

    emitOcr({ requestId: "p1", sourceText: "Hello", lowConfidence: false });
    const request = mocks.regionIpc.requestTranslation.mock.calls[0][0];
    emitTranslation({
      requestId: request.requestId,
      translatedText: "Xin chào",
      provider: "gemini",
      model: "m",
    });
    // A late error for the same request must not override the delivered result.
    emitTranslationError({ requestId: request.requestId });

    expect(result.current.state.status).toBe("translated");
    expect(result.current.state.translation).toBe("Xin chào");
  });
});

describe("useRegionPreview - translation timeout (no silent hang)", () => {
  it("times out a hung translation into the failed state", async () => {
    vi.useFakeTimers();
    try {
      const rendered = renderHook(() => useRegionPreview());
      // Flush the async listener-registration handshake under fake timers.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(mocks.regionIpc.previewReady).toHaveBeenCalled();

      emitOcr({ requestId: "p1", sourceText: "Hello", lowConfidence: false });
      expect(rendered.result.current.state.status).toBe("translating");

      await act(async () => {
        await vi.advanceTimersByTimeAsync(8000);
      });

      expect(rendered.result.current.state.status).toBe("failed");
      expect(rendered.result.current.state.failureReason).toBe("timeout");
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not time out once the translation has arrived", async () => {
    vi.useFakeTimers();
    try {
      const rendered = renderHook(() => useRegionPreview());
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      emitOcr({ requestId: "p1", sourceText: "Hello", lowConfidence: false });
      const request = mocks.regionIpc.requestTranslation.mock.calls[0][0];
      emitTranslation({
        requestId: request.requestId,
        translatedText: "Xin chào",
        provider: "gemini",
        model: "m",
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(8000);
      });

      expect(rendered.result.current.state.status).toBe("translated");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("useRegionPreview - copy (AC-04.8: clipboard only)", () => {
  it("copies the source text and reports feedback", async () => {
    const { result } = await renderPreview();

    emitOcr({ requestId: "p1", sourceText: "Nguồn", lowConfidence: false });
    act(() => result.current.copySource());

    expect(mocks.copyToClipboard).toHaveBeenCalledWith("Nguồn");
    expect(result.current.copied).toBe("source");
  });

  it("copies the translation once available", async () => {
    const { result } = await renderPreview();

    emitOcr({ requestId: "p1", sourceText: "Hello", lowConfidence: false });
    const request = mocks.regionIpc.requestTranslation.mock.calls[0][0];
    emitTranslation({
      requestId: request.requestId,
      translatedText: "Xin chào",
      provider: "gemini",
      model: "m",
    });
    act(() => result.current.copyTranslation());

    expect(mocks.copyToClipboard).toHaveBeenCalledWith("Xin chào");
    expect(result.current.copied).toBe("translation");
  });

  it("does not copy when there is nothing to copy", async () => {
    const { result } = await renderPreview();

    act(() => result.current.copySource());
    act(() => result.current.copyTranslation());

    expect(mocks.copyToClipboard).not.toHaveBeenCalled();
  });
});

describe("useRegionPreview - pin / dismiss / close (AC-04.3)", () => {
  it("Esc-dismiss closes the preview when not pinned", async () => {
    const { result } = await renderPreview();

    act(() => result.current.dismiss());

    expect(mocks.regionIpc.closePreview).toHaveBeenCalledTimes(1);
  });

  it("Esc-dismiss is blocked while pinned; explicit close always works", async () => {
    const { result } = await renderPreview();

    act(() => result.current.togglePin());
    act(() => result.current.dismiss());
    expect(mocks.regionIpc.closePreview).not.toHaveBeenCalled();

    act(() => result.current.close());
    expect(mocks.regionIpc.closePreview).toHaveBeenCalledTimes(1);
  });
});

describe("useRegionPreview - live update and reposition", () => {
  it("forwards the live-update toggle over IPC", async () => {
    const { result } = await renderPreview();

    act(() => result.current.setLiveUpdate(false));

    expect(result.current.liveUpdate).toBe(false);
    expect(mocks.regionIpc.setLiveUpdate).toHaveBeenCalledWith(false);
  });

  it("nudges the overlay window for keyboard repositioning", async () => {
    const { result } = await renderPreview();

    act(() => result.current.nudge(16, 0));

    expect(mocks.regionIpc.nudgePreview).toHaveBeenCalledWith(16, 0);
  });
});
