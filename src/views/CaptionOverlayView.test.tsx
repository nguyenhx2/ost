import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import type { AudioCaptionPayload, ConsentDisclosure } from "../lib/ipc";

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
    audioIpc: mocks.audioIpc,
    captionIpc: mocks.captionIpc,
    modelIpc: mocks.modelIpc,
    settingsIpc: mocks.settingsIpc,
    listenIpc: mocks.listenIpc,
    copyToClipboard: mocks.copyToClipboard,
  };
});

vi.mock("../lib/history", () => ({
  recordTranslation: mocks.recordTranslation,
}));

import {
  EVENT_AUDIO_CAPTION,
  EVENT_AUDIO_ERROR,
  EVENT_MODELS_CONSENT_REQUIRED,
  WHISPER_MODEL_SET_ID,
} from "../lib/ipc";
import { setLocale } from "../lib/i18n";
import { CaptionOverlayView } from "./CaptionOverlayView";

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

function emitError(message: string) {
  act(() => {
    mocks.handlers.get(EVENT_AUDIO_ERROR)?.({ message });
  });
}

function emitConsent(disclosure: ConsentDisclosure) {
  act(() => {
    mocks.handlers.get(EVENT_MODELS_CONSENT_REQUIRED)?.(disclosure);
  });
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

async function renderOverlay() {
  window.history.pushState(
    {},
    "",
    "/?view=caption&provider=gemini&model=gemini-2.5-flash&source=auto&target=vi",
  );
  const rendered = render(<CaptionOverlayView />);
  await waitFor(() => expect(mocks.audioIpc.start).toHaveBeenCalled());
  return rendered;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.handlers.clear();
  setLocale("en");
  mocks.audioIpc.start.mockResolvedValue(undefined);
});

describe("CaptionOverlayView", () => {
  it("renders a caption with provider badge, detected language and translation", async () => {
    await renderOverlay();

    emitCaption(caption());

    // Source + translated text (untrusted DATA rendered as plain text).
    expect(screen.getByText("こんにちは")).toBeInTheDocument();
    expect(screen.getByText("Xin chào")).toBeInTheDocument();
    // Provider/model badge (AC-03.5 transparency).
    expect(screen.getByText("gemini / gemini-2.5-flash")).toBeInTheDocument();
    // Detected source language (AC-01.3) with the auto-detected label.
    expect(screen.getByText(/Detected language/)).toBeInTheDocument();
    expect(screen.getByText("Japanese")).toBeInTheDocument();
  });

  it("flags a low-confidence caption (AC-01.7)", async () => {
    await renderOverlay();

    emitCaption(caption({ lowConfidence: true }));

    expect(
      screen.getByText("Low confidence - this caption may be inaccurate"),
    ).toBeInTheDocument();
  });

  it("shows a localized error without the raw message on audio:error", async () => {
    await renderOverlay();

    emitError("provider 503 internal trace secret-xyz");

    expect(
      screen.getByText(
        "A caption could not be produced - the session is still running",
      ),
    ).toBeInTheDocument();
    // The raw diagnostic never reaches the DOM.
    expect(screen.queryByText(/503/)).toBeNull();
    expect(screen.queryByText(/secret-xyz/)).toBeNull();
  });

  it("opens the whisper consent dialog on models:consent-required (AC-01.8)", async () => {
    await renderOverlay();

    emitConsent(DISCLOSURE);

    const dialog = await screen.findByRole("dialog", {
      name: "Download speech-to-text model",
    });
    expect(dialog).toBeInTheDocument();
    // The disclosure host is named (fail-closed egress transparency).
    expect(screen.getByText(/huggingface\.co/)).toBeInTheDocument();
  });

  it("has keyboard-operable pin and copy controls (AC-04.3/04.8)", async () => {
    await renderOverlay();
    emitCaption(caption());

    expect(
      screen.getByRole("button", { name: "Pin overlay" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Copy caption" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Stop and close" }),
    ).toBeInTheDocument();
  });
});
