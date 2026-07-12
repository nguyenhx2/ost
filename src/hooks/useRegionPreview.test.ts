import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type {
  OcrResultPayload,
  TranslationDeltaPayload,
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
    settingsIpc: { open: vi.fn().mockResolvedValue(undefined) },
    keysIpc: { statuses: vi.fn() },
    listenIpc: vi.fn((event: string, handler: (payload: unknown) => void) => {
      handlers.set(event, handler);
      return Promise.resolve(() => handlers.delete(event));
    }),
    copyToClipboard: vi.fn().mockResolvedValue(undefined),
    recordTranslation: vi.fn().mockResolvedValue(null),
    loadProviderSettings: vi.fn(),
    loadRegionLanguageSettings: vi.fn(),
    saveRegionLanguageSettings: vi.fn().mockResolvedValue(undefined),
    loadRegionPreviewLayout: vi.fn(),
    saveRegionPreviewLayout: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock("../lib/ipc", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/ipc")>();
  return {
    ...actual,
    regionIpc: mocks.regionIpc,
    settingsIpc: mocks.settingsIpc,
    keysIpc: mocks.keysIpc,
    listenIpc: mocks.listenIpc,
    copyToClipboard: mocks.copyToClipboard,
  };
});

vi.mock("../lib/history", () => ({
  recordTranslation: mocks.recordTranslation,
}));

vi.mock("../lib/settings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/settings")>();
  return {
    ...actual,
    loadProviderSettings: mocks.loadProviderSettings,
  };
});

vi.mock("../lib/regionLanguageSettings", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../lib/regionLanguageSettings")>();
  return {
    ...actual,
    loadRegionLanguageSettings: mocks.loadRegionLanguageSettings,
    saveRegionLanguageSettings: mocks.saveRegionLanguageSettings,
  };
});

vi.mock("../lib/regionLayoutSettings", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../lib/regionLayoutSettings")>();
  return {
    ...actual,
    loadRegionPreviewLayout: mocks.loadRegionPreviewLayout,
    saveRegionPreviewLayout: mocks.saveRegionPreviewLayout,
  };
});

import {
  EVENT_REGION_SELECTED,
  EVENT_REGION_OCR_RESULT,
  EVENT_REGION_TRANSLATION_DELTA,
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

function emitTranslationDelta(payload: TranslationDeltaPayload) {
  act(() => {
    mocks.handlers.get(EVENT_REGION_TRANSLATION_DELTA)?.(payload);
  });
}

async function renderPreview() {
  const rendered = renderHook(() => useRegionPreview());
  // The handshake guarantees listeners are attached before events flow.
  await waitFor(() => expect(mocks.regionIpc.previewReady).toHaveBeenCalled());
  return rendered;
}

function keyStatuses(present: Partial<Record<string, boolean>>) {
  return [
    { provider_id: "gemini", key_present: !!present.gemini },
    { provider_id: "anthropic", key_present: !!present.anthropic },
    { provider_id: "openai", key_present: !!present.openai },
    { provider_id: "openrouter", key_present: !!present.openrouter },
  ];
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.handlers.clear();
  // Default: a key IS configured, so existing translate-request behavior is
  // unaffected; the zero-key describe block below overrides this per test.
  mocks.keysIpc.statuses.mockResolvedValue(keyStatuses({ gemini: true }));
  // Default persisted selection matches the catalog default, so tests that do
  // not care about provider selection see the previous behavior.
  mocks.loadProviderSettings.mockResolvedValue({
    defaultProvider: "gemini",
    models: {
      gemini: "gemini-2.5-flash",
      anthropic: "claude-sonnet-4-5",
      openai: "gpt-5-mini",
      openrouter: "auto",
    },
    fallbackOrder: [],
    localOpenAi: { baseUrl: "", modelId: "" },
  });
  mocks.loadRegionLanguageSettings.mockResolvedValue({
    sourceLanguage: "auto",
    targetLanguage: "vi",
  });
  mocks.saveRegionLanguageSettings.mockResolvedValue(undefined);
  mocks.loadRegionPreviewLayout.mockResolvedValue("stacked");
  mocks.saveRegionPreviewLayout.mockResolvedValue(undefined);
});

function emitRegionSelected() {
  act(() => {
    mocks.handlers.get(EVENT_REGION_SELECTED)?.(undefined);
  });
}

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

describe("useRegionPreview - no provider key configured (TASK-025)", () => {
  it("detects zero keys client-side and never fires the doomed translate request", async () => {
    mocks.keysIpc.statuses.mockResolvedValue(keyStatuses({}));
    const { result } = await renderPreview();
    await waitFor(() => expect(mocks.keysIpc.statuses).toHaveBeenCalled());

    emitOcr({ requestId: "p1", sourceText: "Hello", lowConfidence: false });

    expect(result.current.state.status).toBe("failed");
    expect(result.current.state.failureReason).toBe("noKey");
    expect(mocks.regionIpc.requestTranslation).not.toHaveBeenCalled();
  });

  it("retranslate stays gated (no-op translate call) while no key is configured", async () => {
    mocks.keysIpc.statuses.mockResolvedValue(keyStatuses({}));
    const { result } = await renderPreview();
    await waitFor(() => expect(mocks.keysIpc.statuses).toHaveBeenCalled());

    emitOcr({ requestId: "p1", sourceText: "Hello", lowConfidence: false });
    expect(mocks.regionIpc.requestTranslation).not.toHaveBeenCalled();

    act(() => result.current.retranslate());

    expect(result.current.state.status).toBe("failed");
    expect(result.current.state.failureReason).toBe("noKey");
    expect(mocks.regionIpc.requestTranslation).not.toHaveBeenCalled();
  });

  it("openSettings invokes the Settings-open IPC", async () => {
    mocks.keysIpc.statuses.mockResolvedValue(keyStatuses({}));
    const { result } = await renderPreview();
    await waitFor(() => expect(mocks.keysIpc.statuses).toHaveBeenCalled());

    act(() => result.current.openSettings());

    expect(mocks.settingsIpc.open).toHaveBeenCalledTimes(1);
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

  it("a slow-but-live stream never trips the false timeout once the FIRST delta arrives (item 1b)", async () => {
    vi.useFakeTimers();
    try {
      const rendered = renderHook(() => useRegionPreview());
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      emitOcr({ requestId: "p1", sourceText: "Hello", lowConfidence: false });
      const request = mocks.regionIpc.requestTranslation.mock.calls[0][0];

      // A single early delta proves the stream is alive - even though the
      // FINAL result has not arrived yet.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(4000);
      });
      emitTranslationDelta({ requestId: request.requestId, text: "Xin " });

      // The OLD 8s budget (measured from the request, not the delta) would
      // have expired by now under the pre-fix behavior; the first delta must
      // have cleared it.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(6000);
      });

      expect(rendered.result.current.state.status).toBe("translating");
      expect(rendered.result.current.state.translation).toBe("Xin ");

      emitTranslation({
        requestId: request.requestId,
        translatedText: "Xin chào",
        provider: "gemini",
        model: "m",
      });
      expect(rendered.result.current.state.status).toBe("translated");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("useRegionPreview - streaming translation (owner complaint 1)", () => {
  it("renders progressive deltas as accumulated text while still translating", async () => {
    const { result } = await renderPreview();

    emitOcr({ requestId: "p1", sourceText: "Hello", lowConfidence: false });
    const request = mocks.regionIpc.requestTranslation.mock.calls[0][0];

    emitTranslationDelta({ requestId: request.requestId, text: "Xin " });
    expect(result.current.state.status).toBe("translating");
    expect(result.current.state.translation).toBe("Xin ");

    emitTranslationDelta({ requestId: request.requestId, text: "Xin chào" });
    expect(result.current.state.status).toBe("translating");
    expect(result.current.state.translation).toBe("Xin chào");

    emitTranslation({
      requestId: request.requestId,
      translatedText: "Xin chào thế giới",
      provider: "gemini",
      model: "gemini-2.5-flash",
    });
    expect(result.current.state.status).toBe("translated");
    expect(result.current.state.translation).toBe("Xin chào thế giới");
  });

  it("ignores a stale delta from a superseded request", async () => {
    const { result } = await renderPreview();

    emitOcr({ requestId: "p1", sourceText: "Hello", lowConfidence: false });
    emitTranslationDelta({ requestId: "not-the-current-request", text: "x" });

    expect(result.current.state.translation).toBeNull();
    expect(result.current.state.status).toBe("translating");
  });

  it("allows copying the in-progress partial translation", async () => {
    const { result } = await renderPreview();

    emitOcr({ requestId: "p1", sourceText: "Hello", lowConfidence: false });
    const request = mocks.regionIpc.requestTranslation.mock.calls[0][0];
    emitTranslationDelta({ requestId: request.requestId, text: "Xin " });

    act(() => result.current.copyTranslation());

    expect(mocks.copyToClipboard).toHaveBeenCalledWith("Xin ");
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

describe("useRegionPreview - configured provider (AC-03.5)", () => {
  it("translates with the provider configured in Settings, not the catalog default", async () => {
    // The user configured OpenRouter and stored an OpenRouter key. Before this
    // fix the preview held the hardcoded catalog default (gemini) forever, so
    // every translate call went to a provider with no key and failed.
    mocks.loadProviderSettings.mockResolvedValue({
      defaultProvider: "openrouter",
      models: {
        gemini: "gemini-2.5-flash",
        anthropic: "claude-sonnet-4-5",
        openai: "gpt-5-mini",
        openrouter: "auto",
      },
      fallbackOrder: [],
      localOpenAi: { baseUrl: "", modelId: "" },
    });

    const { result } = renderHook(() => useRegionPreview());

    await waitFor(() =>
      expect(result.current.option.provider).toBe("openrouter"),
    );

    emitOcr({
      requestId: "p1",
      sourceText: "Hello world",
      lowConfidence: false,
    });

    await waitFor(() =>
      expect(mocks.regionIpc.requestTranslation).toHaveBeenCalled(),
    );
    const request = mocks.regionIpc.requestTranslation.mock.calls[0][0];
    expect(request.provider).toBe("openrouter");
    expect(request.model).toBe("auto");
  });

  it("uses the local OpenAI-compatible provider when that is the selection", async () => {
    mocks.loadProviderSettings.mockResolvedValue({
      defaultProvider: "local_openai",
      models: {
        gemini: "gemini-2.5-flash",
        anthropic: "claude-sonnet-4-5",
        openai: "gpt-5-mini",
        openrouter: "auto",
      },
      fallbackOrder: [],
      localOpenAi: {
        baseUrl: "http://localhost:1234/v1",
        modelId: "gemma-3-12b",
      },
    });

    const { result } = renderHook(() => useRegionPreview());

    await waitFor(() =>
      expect(result.current.option.provider).toBe("local_openai"),
    );
    expect(result.current.option.model).toBe("gemma-3-12b");
  });
});

describe("useRegionPreview - refresh on a new region while already open (item 2 bug fix)", () => {
  it("resets state and re-runs the OCR handshake on region:selected", async () => {
    const { result } = await renderPreview();

    emitOcr({ requestId: "p1", sourceText: "Hello", lowConfidence: false });
    const request = mocks.regionIpc.requestTranslation.mock.calls[0][0];
    emitTranslation({
      requestId: request.requestId,
      translatedText: "Xin chào",
      provider: "gemini",
      model: "gemini-2.5-flash",
    });
    expect(result.current.state.status).toBe("translated");

    mocks.regionIpc.previewReady.mockClear();
    emitRegionSelected();

    // Back to the initial "waiting for OCR" shape - the OLD region's text and
    // translation are gone, not left stale on screen.
    expect(result.current.state.status).toBe("waitingOcr");
    expect(result.current.state.sourceText).toBe("");
    expect(result.current.state.translation).toBeNull();
    // Re-arms the pipeline for the NEW region.
    expect(mocks.regionIpc.previewReady).toHaveBeenCalledTimes(1);

    // The NEW region's OCR result now drives the dialog normally.
    emitOcr({ requestId: "p2", sourceText: "Bonjour", lowConfidence: false });
    expect(result.current.state.sourceText).toBe("Bonjour");
  });

  it("ignores a stale translation response from BEFORE the reset", async () => {
    const { result } = await renderPreview();

    emitOcr({ requestId: "p1", sourceText: "Hello", lowConfidence: false });
    const staleRequest = mocks.regionIpc.requestTranslation.mock.calls[0][0];

    emitRegionSelected();
    emitOcr({ requestId: "p2", sourceText: "Bonjour", lowConfidence: false });

    // The pre-reset request's response must not clobber the new region.
    emitTranslation({
      requestId: staleRequest.requestId,
      translatedText: "stale",
      provider: "gemini",
      model: "m",
    });

    expect(result.current.state.sourceText).toBe("Bonjour");
    expect(result.current.state.translation).not.toBe("stale");
  });
});

describe("useRegionPreview - language pickers (item 3)", () => {
  it("loads the persisted source/target language preference on mount", async () => {
    mocks.loadRegionLanguageSettings.mockResolvedValue({
      sourceLanguage: "ja",
      targetLanguage: "ko",
    });
    const { result } = await renderPreview();

    await waitFor(() => expect(result.current.sourceLanguage).toBe("ja"));
    expect(result.current.targetLanguage).toBe("ko");
  });

  it("defaults the target language to vi (BR-07)", async () => {
    const { result } = await renderPreview();
    expect(result.current.targetLanguage).toBe("vi");
  });

  it("threads the chosen target language into the translate request", async () => {
    const { result } = await renderPreview();

    act(() => result.current.setTargetLanguage("ja"));
    emitOcr({ requestId: "p1", sourceText: "Hello", lowConfidence: false });

    const request = mocks.regionIpc.requestTranslation.mock.calls[0][0];
    expect(request.targetLanguage).toBe("ja");
  });

  it("threads the chosen target language into recorded history", async () => {
    const { result } = await renderPreview();

    act(() => result.current.setTargetLanguage("ja"));
    emitOcr({ requestId: "p1", sourceText: "Hello", lowConfidence: false });
    const request = mocks.regionIpc.requestTranslation.mock.calls[0][0];
    emitTranslation({
      requestId: request.requestId,
      translatedText: "Konnichiwa",
      provider: "gemini",
      model: "gemini-2.5-flash",
    });

    const recorded = mocks.recordTranslation.mock.calls[0][0];
    expect(recorded.targetLanguage).toBe("ja");
  });

  it("persists a picker change so it survives (settings round-trip)", async () => {
    const { result } = await renderPreview();

    act(() => result.current.setTargetLanguage("ko"));

    await waitFor(() =>
      expect(mocks.saveRegionLanguageSettings).toHaveBeenCalledWith(
        expect.objectContaining({ targetLanguage: "ko" }),
      ),
    );

    act(() => result.current.setSourceLanguage("ja"));
    await waitFor(() =>
      expect(mocks.saveRegionLanguageSettings).toHaveBeenCalledWith(
        expect.objectContaining({ sourceLanguage: "ja" }),
      ),
    );
  });
});

describe("useRegionPreview - in-dialog re-select (item 1)", () => {
  it("reselect() opens the same fullscreen select overlay", async () => {
    const { result } = await renderPreview();

    result.current.reselect();

    expect(mocks.regionIpc.startSelection).toHaveBeenCalledTimes(1);
  });
});

describe("useRegionPreview - display layout (owner item 1)", () => {
  it("defaults to the stacked layout", async () => {
    const { result } = await renderPreview();
    expect(result.current.layout).toBe("stacked");
  });

  it("loads a persisted columns layout on mount", async () => {
    mocks.loadRegionPreviewLayout.mockResolvedValue("columns");
    const { result } = await renderPreview();

    await waitFor(() => expect(result.current.layout).toBe("columns"));
  });

  it("setLayout updates state and persists the choice", async () => {
    const { result } = await renderPreview();

    act(() => result.current.setLayout("columns"));

    expect(result.current.layout).toBe("columns");
    await waitFor(() =>
      expect(mocks.saveRegionPreviewLayout).toHaveBeenCalledWith("columns"),
    );
  });
});

describe("useRegionPreview - pasteable/editable source (owner item 2)", () => {
  it("pasting text translates it through the SAME path OCR text uses", async () => {
    const { result } = await renderPreview();

    act(() => result.current.pasteSourceText("Pasted hello"));

    expect(result.current.state.sourceText).toBe("Pasted hello");
    expect(result.current.state.status).toBe("translating");
    expect(mocks.regionIpc.requestTranslation).toHaveBeenCalledWith(
      expect.objectContaining({ sourceText: "Pasted hello" }),
    );
  });

  it("keeps the draft in sync with the pasted text", async () => {
    const { result } = await renderPreview();

    act(() => result.current.pasteSourceText("Pasted hello"));

    expect(result.current.sourceDraft).toBe("Pasted hello");
  });

  it("pasting empty text shows the empty state and sends no translate request", async () => {
    const { result } = await renderPreview();

    act(() => result.current.pasteSourceText("   "));

    expect(result.current.state.status).toBe("empty");
    expect(mocks.regionIpc.requestTranslation).not.toHaveBeenCalled();
  });

  it("respects the no-key gate for pasted text (TASK-025 parity)", async () => {
    mocks.keysIpc.statuses.mockResolvedValue(keyStatuses({}));
    const { result } = await renderPreview();

    act(() => result.current.pasteSourceText("Pasted hello"));

    expect(result.current.state.status).toBe("failed");
    expect(result.current.state.failureReason).toBe("noKey");
    expect(mocks.regionIpc.requestTranslation).not.toHaveBeenCalled();
  });

  it("commitSourceEdit translates a manually edited draft that differs from the current source", async () => {
    const { result } = await renderPreview();
    emitOcr({ requestId: "p1", sourceText: "Hello", lowConfidence: false });
    mocks.regionIpc.requestTranslation.mockClear();

    act(() => result.current.setSourceDraft("Hello there"));
    act(() => result.current.commitSourceEdit());

    expect(mocks.regionIpc.requestTranslation).toHaveBeenCalledWith(
      expect.objectContaining({ sourceText: "Hello there" }),
    );
  });

  it("commitSourceEdit is a no-op when the draft is unchanged", async () => {
    const { result } = await renderPreview();
    emitOcr({ requestId: "p1", sourceText: "Hello", lowConfidence: false });
    mocks.regionIpc.requestTranslation.mockClear();

    act(() => result.current.commitSourceEdit());

    expect(mocks.regionIpc.requestTranslation).not.toHaveBeenCalled();
  });

  it("setSourceDraft alone (no paste/commit) never fires a translate request", async () => {
    const { result } = await renderPreview();

    act(() => result.current.setSourceDraft("still typing"));

    expect(mocks.regionIpc.requestTranslation).not.toHaveBeenCalled();
  });
});
