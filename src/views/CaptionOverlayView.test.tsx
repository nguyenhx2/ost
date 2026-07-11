import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
    keysIpc: { statuses: vi.fn() },
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
    keysIpc: mocks.keysIpc,
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
  setLocale("en");
  mocks.audioIpc.start.mockResolvedValue(undefined);
  // Default: a key IS configured, so the session starts as before; the
  // zero-key tests below override this per test.
  mocks.keysIpc.statuses.mockResolvedValue(keyStatuses({ gemini: true }));
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

  it("shows the distinct no-key notice (not the generic start-failed message) when zero keys are configured (TASK-025)", async () => {
    mocks.keysIpc.statuses.mockResolvedValue(keyStatuses({}));
    window.history.pushState(
      {},
      "",
      "/?view=caption&provider=gemini&model=gemini-2.5-flash&source=auto&target=vi",
    );
    render(<CaptionOverlayView />);

    await screen.findByText(
      "No provider key is configured - open Settings to add one",
    );
    expect(mocks.audioIpc.start).not.toHaveBeenCalled();
    expect(
      screen.queryByText(
        "Could not start the audio session - please try again",
      ),
    ).toBeNull();

    await act(async () => {
      screen.getByRole("button", { name: "Open Settings" }).click();
    });
    expect(mocks.settingsIpc.open).toHaveBeenCalledTimes(1);
  });

  it("shows the generic start-failed message (not the no-key notice) for a real start failure with a key configured", async () => {
    mocks.audioIpc.start.mockRejectedValueOnce({ kind: "capture" });
    await renderOverlay();

    await screen.findByText(
      "Could not start the audio session - please try again",
    );
    expect(
      screen.queryByText(
        "No provider key is configured - open Settings to add one",
      ),
    ).toBeNull();
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

  it("close button visibly closes the overlay and stops the session (owner complaint: no way to close it)", async () => {
    await renderOverlay();
    emitCaption(caption());

    await userEvent.click(
      screen.getByRole("button", { name: "Stop and close" }),
    );

    await waitFor(() => expect(mocks.audioIpc.stop).toHaveBeenCalledTimes(1));
    expect(mocks.captionIpc.closeOverlay).toHaveBeenCalledTimes(1);
  });

  it("keeps a single scrollable body between the fixed header and the docked controls (owner complaint: long content must scroll, not squeeze)", async () => {
    const { container } = await renderOverlay();
    emitCaption(caption());

    const panel = container.querySelector(".ost-overlay-panel");
    const body = container.querySelector(".caption-overlay-body");
    const controls = container.querySelector(".caption-overlay-controls");
    expect(panel).not.toBeNull();
    expect(body).not.toBeNull();
    expect(controls).not.toBeNull();
    const children = Array.from(panel?.children ?? []);
    expect(children.indexOf(body!)).toBeGreaterThan(
      children.findIndex((el) => el.tagName === "HEADER"),
    );
    expect(children.indexOf(controls!)).toBeGreaterThan(
      children.indexOf(body!),
    );
    // The transcript/translation live inside the scrollable body, not
    // directly in the panel (so it scrolls instead of shrinking the panel).
    expect(body?.textContent).toContain("こんにちは");
    expect(body?.textContent).toContain("Xin chào");
  });
});
