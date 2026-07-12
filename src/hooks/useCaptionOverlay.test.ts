import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type {
  AudioCaptionPayload,
  AudioErrorPayload,
  AudioSessionRequest,
  ConsentDisclosure,
} from "../lib/ipc";

const mocks = vi.hoisted(() => {
  const handlers = new Map<string, (payload: unknown) => void>();
  return {
    handlers,
    audioIpc: {
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
    },
    captionIpc: {
      openOverlay: vi.fn().mockResolvedValue(undefined),
      closeOverlay: vi.fn().mockResolvedValue(undefined),
      nudgeOverlay: vi.fn().mockResolvedValue(undefined),
    },
    modelIpc: {
      consentStatus: vi.fn().mockResolvedValue(undefined),
      grantConsent: vi.fn().mockResolvedValue(undefined),
      revokeConsent: vi.fn().mockResolvedValue(undefined),
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
  };
});

vi.mock("../lib/ipc", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/ipc")>();
  return {
    ...actual,
    audioIpc: mocks.audioIpc,
    captionIpc: mocks.captionIpc,
    modelIpc: mocks.modelIpc,
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

import {
  EVENT_AUDIO_CAPTION,
  EVENT_AUDIO_ERROR,
  EVENT_MODELS_CONSENT_REQUIRED,
  WHISPER_MODEL_SET_ID,
} from "../lib/ipc";
import { useCaptionOverlay } from "./useCaptionOverlay";

const REQUEST: AudioSessionRequest = {
  provider: "gemini",
  model: "gemini-2.5-flash",
  sourceLanguage: "ja",
  targetLanguage: "vi",
};

function caption(over: Partial<AudioCaptionPayload> = {}): AudioCaptionPayload {
  return {
    sequence: 0,
    sourceText: "こんにちは",
    translatedText: "Xin chào",
    sourceLanguage: "ja",
    sourceLanguageAutoDetected: true,
    targetLanguage: "vi",
    provider: "gemini",
    model: "gemini-2.5-flash",
    segmentConfidences: [0.9],
    lowConfidence: false,
    timestampMs: 100,
    ...over,
  };
}

function emitCaption(payload: AudioCaptionPayload) {
  act(() => {
    mocks.handlers.get(EVENT_AUDIO_CAPTION)?.(payload);
  });
}

function emitError(payload: AudioErrorPayload) {
  act(() => {
    mocks.handlers.get(EVENT_AUDIO_ERROR)?.(payload);
  });
}

function emitConsent(disclosure: ConsentDisclosure) {
  act(() => {
    mocks.handlers.get(EVENT_MODELS_CONSENT_REQUIRED)?.(disclosure);
  });
}

async function renderOverlay(request: AudioSessionRequest = REQUEST) {
  const rendered = renderHook(() => useCaptionOverlay(request));
  // The overlay starts the session once its listeners are attached.
  await waitFor(() => expect(mocks.audioIpc.start).toHaveBeenCalled());
  return rendered;
}

const DISCLOSURE: ConsentDisclosure = {
  modelSetId: WHISPER_MODEL_SET_ID,
  displayName: "Whisper base",
  hostName: "Hugging Face",
  hostDomain: "huggingface.co",
  artifacts: [{ filename: "ggml-base.bin", approxSizeBytes: 142_000_000 }],
  totalApproxSizeBytes: 142_000_000,
  destination: "~/.cache/whisper",
};

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
  mocks.audioIpc.start.mockResolvedValue(undefined);
  mocks.audioIpc.stop.mockResolvedValue(undefined);
  mocks.captionIpc.closeOverlay.mockResolvedValue(undefined);
  mocks.modelIpc.grantConsent.mockResolvedValue(undefined);
  // Default: a key IS configured, so existing session-start behavior is
  // unaffected; the zero-key describe block below overrides this per test.
  mocks.keysIpc.statuses.mockResolvedValue(keyStatuses({ gemini: true }));
  // Default persisted selection: not the local provider, so the local-url
  // gate below never applies to the (default) gemini test request.
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
});

describe("useCaptionOverlay - session start (AC-01.1)", () => {
  it("starts the session it was opened for with the exact request", async () => {
    await renderOverlay();
    expect(mocks.audioIpc.start).toHaveBeenCalledWith({
      provider: "gemini",
      model: "gemini-2.5-flash",
      sourceLanguage: "ja",
      targetLanguage: "vi",
    });
  });
});

describe("useCaptionOverlay - caption rendering (AC-01.3/01.7, AC-03.5)", () => {
  it("exposes the latest caption with provider, language and confidence", async () => {
    const { result } = await renderOverlay();

    emitCaption(
      caption({ lowConfidence: true, provider: "openai", model: "gpt-5" }),
    );

    expect(result.current.state.caption?.sourceText).toBe("こんにちは");
    expect(result.current.state.caption?.translatedText).toBe("Xin chào");
    expect(result.current.state.caption?.sourceLanguage).toBe("ja");
    expect(result.current.state.caption?.lowConfidence).toBe(true);
    // Provider/model transparency (AC-03.5): the badge reads the caption values.
    expect(result.current.state.caption?.provider).toBe("openai");
  });
});

describe("useCaptionOverlay - history recording (BR-06/AC-04.4)", () => {
  it("records each completed caption text-only as an audio session", async () => {
    await renderOverlay();

    emitCaption(caption());

    expect(mocks.recordTranslation).toHaveBeenCalledTimes(1);
    const recorded = mocks.recordTranslation.mock.calls[0][0];
    expect(recorded).toEqual({
      sessionType: "audio",
      sourceText: "こんにちは",
      translatedText: "Xin chào",
      sourceLanguage: "ja",
      targetLanguage: "vi",
      providerId: "gemini",
      modelId: "gemini-2.5-flash",
    });
    // Text-only gate: the raw audio-payload fields (samples, per-segment
    // confidences, timestamps, sequence) NEVER cross the recording seam, and
    // there is no key/screenshot field. (`audio` legitimately appears only as
    // the sessionType value.)
    const json = JSON.stringify(recorded).toLowerCase();
    expect(json).not.toContain("key");
    expect(json).not.toContain("screenshot");
    expect(json).not.toContain("sample");
    expect(json).not.toContain("buffer");
    expect(json).not.toContain("confidence");
    expect(json).not.toContain("timestamp");
    expect(json).not.toContain("sequence");
    // The only place "audio" appears is the session type.
    expect(recorded.sessionType).toBe("audio");
  });
});

describe("useCaptionOverlay - audio error (human-in-the-loop.md)", () => {
  it("flags a chunk error without surfacing the raw message", async () => {
    const { result } = await renderOverlay();

    emitError({ message: "provider 503 internal error trace xyz" });

    expect(result.current.state.chunkError).toBe(true);
    // The hook exposes only the flag - never the raw diagnostic string.
    expect(JSON.stringify(result.current.state)).not.toContain("503");
  });
});

describe("useCaptionOverlay - model consent (fail-closed, AC-01.8)", () => {
  it("opens the disclosure dialog on models:consent-required", async () => {
    const { result } = await renderOverlay();

    emitConsent(DISCLOSURE);

    expect(result.current.consentDialogOpen).toBe(true);
    expect(result.current.consentDisclosure?.modelSetId).toBe(
      WHISPER_MODEL_SET_ID,
    );
  });

  it("grant opens the gate and re-signals the session", async () => {
    const { result } = await renderOverlay();
    emitConsent(DISCLOSURE);
    expect(mocks.audioIpc.start).toHaveBeenCalledTimes(1);

    await act(async () => {
      result.current.grantConsent();
    });

    expect(mocks.modelIpc.grantConsent).toHaveBeenCalledWith(
      WHISPER_MODEL_SET_ID,
    );
    // Re-signal: the session start is called again after the grant.
    await waitFor(() => expect(mocks.audioIpc.start).toHaveBeenCalledTimes(2));
    expect(result.current.consentDialogOpen).toBe(false);
  });
});

describe("useCaptionOverlay - no provider key configured (TASK-025)", () => {
  it("detects zero keys client-side and never fires the doomed start call", async () => {
    mocks.keysIpc.statuses.mockResolvedValue(keyStatuses({}));
    const { result } = renderHook(() => useCaptionOverlay(REQUEST));

    await waitFor(() =>
      expect(result.current.state.startError?.kind).toBe("noProviderKey"),
    );
    expect(mocks.audioIpc.start).not.toHaveBeenCalled();
  });

  it("openSettings invokes the Settings-open IPC", async () => {
    mocks.keysIpc.statuses.mockResolvedValue(keyStatuses({}));
    const { result } = renderHook(() => useCaptionOverlay(REQUEST));

    await waitFor(() =>
      expect(result.current.state.startError?.kind).toBe("noProviderKey"),
    );
    act(() => result.current.openSettings());

    expect(mocks.settingsIpc.open).toHaveBeenCalledTimes(1);
  });
});

describe("useCaptionOverlay - local provider not configured (owner-reported bug)", () => {
  const LOCAL_REQUEST: AudioSessionRequest = {
    provider: "local_openai",
    model: "Hy-MT2-7B",
    sourceLanguage: "ja",
    targetLanguage: "vi",
  };

  function withLocalProvider(baseUrl: string) {
    mocks.loadProviderSettings.mockResolvedValue({
      defaultProvider: "local_openai",
      models: {
        gemini: "gemini-2.5-flash",
        anthropic: "claude-sonnet-4-5",
        openai: "gpt-5-mini",
        openrouter: "auto",
      },
      fallbackOrder: [],
      localOpenAi: { baseUrl, modelId: "Hy-MT2-7B" },
    });
  }

  it("shows localNotConfigured (never noKey) for an empty base_url, with zero keys stored", async () => {
    mocks.keysIpc.statuses.mockResolvedValue(keyStatuses({}));
    withLocalProvider("");
    const { result } = renderHook(() => useCaptionOverlay(LOCAL_REQUEST));

    await waitFor(() =>
      expect(result.current.state.startError?.kind).toBe("localNotConfigured"),
    );
    expect(mocks.audioIpc.start).not.toHaveBeenCalled();
    // The key-status path must never even be consulted for this provider.
    expect(mocks.keysIpc.statuses).not.toHaveBeenCalled();
  });

  it("shows localNotConfigured for a non-loopback base_url", async () => {
    withLocalProvider("https://example.com");
    const { result } = renderHook(() => useCaptionOverlay(LOCAL_REQUEST));

    await waitFor(() =>
      expect(result.current.state.startError?.kind).toBe("localNotConfigured"),
    );
    expect(mocks.audioIpc.start).not.toHaveBeenCalled();
  });

  it("starts the session with the resolved base_url for a valid loopback URL", async () => {
    withLocalProvider("http://127.0.0.1:1234");
    const { result } = renderHook(() => useCaptionOverlay(LOCAL_REQUEST));

    await waitFor(() => expect(mocks.audioIpc.start).toHaveBeenCalled());
    expect(mocks.audioIpc.start).toHaveBeenCalledWith({
      ...LOCAL_REQUEST,
      baseUrl: "http://127.0.0.1:1234",
    });
    expect(result.current.state.startError).toBeNull();
  });

  it("openSettings invokes the Settings-open IPC from the localNotConfigured notice", async () => {
    withLocalProvider("");
    const { result } = renderHook(() => useCaptionOverlay(LOCAL_REQUEST));

    await waitFor(() =>
      expect(result.current.state.startError?.kind).toBe("localNotConfigured"),
    );
    act(() => result.current.openSettings());

    expect(mocks.settingsIpc.open).toHaveBeenCalledTimes(1);
  });
});

describe("useCaptionOverlay - start failure (AC-01.11)", () => {
  it("surfaces noProviderKey as a typed start error (Settings CTA)", async () => {
    mocks.audioIpc.start.mockRejectedValueOnce({ kind: "noProviderKey" });
    const { result } = await renderOverlay();

    await waitFor(() =>
      expect(result.current.state.startError?.kind).toBe("noProviderKey"),
    );
  });

  it("does NOT surface consentRequired as an error (the dialog handles it)", async () => {
    mocks.audioIpc.start.mockRejectedValueOnce({ kind: "consentRequired" });
    const { result } = await renderOverlay();

    // Give the rejected start a tick to settle.
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.state.startError).toBeNull();
  });
});

describe("useCaptionOverlay - copy / pin / dismiss (AC-04.3/04.8)", () => {
  it("copies the translation (clipboard is the only outbound action)", async () => {
    const { result } = await renderOverlay();
    emitCaption(caption());

    act(() => result.current.copyTranslation());

    expect(mocks.copyToClipboard).toHaveBeenCalledWith("Xin chào");
    expect(result.current.copied).toBe("translation");
  });

  it("Esc-dismiss stops and closes when not pinned; pinned blocks it", async () => {
    const { result } = await renderOverlay();

    act(() => result.current.togglePin());
    act(() => result.current.dismiss());
    expect(mocks.audioIpc.stop).not.toHaveBeenCalled();

    act(() => result.current.togglePin());
    await act(async () => {
      result.current.dismiss();
    });
    await waitFor(() => expect(mocks.audioIpc.stop).toHaveBeenCalledTimes(1));
    expect(mocks.captionIpc.closeOverlay).toHaveBeenCalledTimes(1);
  });

  it("nudges the overlay window for keyboard repositioning", async () => {
    const { result } = await renderOverlay();

    act(() => result.current.nudge(16, 0));

    expect(mocks.captionIpc.nudgeOverlay).toHaveBeenCalledWith(16, 0);
  });
});
