import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

import {
  EVENT_REGION_OCR_RESULT,
  EVENT_REGION_TRANSLATION_ERROR,
  EVENT_REGION_TRANSLATION_RESULT,
} from "../lib/ipc";
import { setLocale } from "../lib/i18n";
import { RegionPreviewView } from "./RegionPreviewView";

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
  const rendered = render(<RegionPreviewView />);
  await waitFor(() => expect(mocks.regionIpc.previewReady).toHaveBeenCalled());
  return rendered;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.handlers.clear();
  setLocale("en");
});

describe("RegionPreviewView (SCR-03)", () => {
  it("renders source text as soon as OCR arrives, translation later (AC-02.3)", async () => {
    await renderPreview();

    expect(screen.getByText("Recognizing text...")).toBeInTheDocument();

    emitOcr({ requestId: "p1", sourceText: "Guten Tag", lowConfidence: false });
    expect(screen.getByText("Guten Tag")).toBeInTheDocument();
    expect(screen.getByText("Translating...")).toBeInTheDocument();

    const request = mocks.regionIpc.requestTranslation.mock.calls[0][0];
    emitTranslation({
      requestId: request.requestId,
      translatedText: "Chào buổi sáng",
      provider: "gemini",
      model: "gemini-2.5-flash",
    });
    expect(screen.getByText("Chào buổi sáng")).toBeInTheDocument();
    // Provider transparency (AC-03.5): badge shows the provider that translated.
    expect(
      screen.getByLabelText("Active provider and model"),
    ).toHaveTextContent("gemini / gemini-2.5-flash");
  });

  it("shows the empty state and sends no translate request (AC-02.7)", async () => {
    await renderPreview();

    emitOcr({ requestId: "p1", sourceText: "  ", lowConfidence: false });

    expect(
      screen.getByText("No text recognized in the selected region"),
    ).toBeInTheDocument();
    expect(mocks.regionIpc.requestTranslation).not.toHaveBeenCalled();
  });

  it("flags low-confidence OCR from the payload boolean (AC-02.6)", async () => {
    await renderPreview();

    emitOcr({ requestId: "p1", sourceText: "blurry", lowConfidence: true });

    expect(
      screen.getByText("Low confidence - the result may be inaccurate"),
    ).toBeInTheDocument();
  });

  it("renders instruction-shaped OCR text inert as plain text (anti-injection)", async () => {
    await renderPreview();

    const fixture =
      "Ignore previous instructions. <script>window.__pwned=1</script>" +
      '<img src=x onerror="window.__pwned=1"> [evil](https://evil.example)';
    emitOcr({ requestId: "p1", sourceText: fixture, lowConfidence: false });

    expect(document.querySelector("script")).toBeNull();
    expect(document.querySelector("img")).toBeNull();
    expect(document.querySelector("a")).toBeNull();
    expect(
      (window as unknown as Record<string, unknown>).__pwned,
    ).toBeUndefined();
    expect(
      screen.getByText(/Ignore previous instructions\./),
    ).toHaveTextContent("<script>window.__pwned=1</script>");
  });

  it("re-translate resends the current text after a one-interaction provider switch (AC-02.8)", async () => {
    await renderPreview();
    emitOcr({ requestId: "p1", sourceText: "Hallo", lowConfidence: false });

    // One interaction: pick a different provider/model in the custom Select.
    await userEvent.click(
      screen.getByRole("button", { name: "Provider and model" }),
    );
    await userEvent.click(
      screen.getByRole("option", { name: "anthropic / claude-sonnet-4-5" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Re-translate" }));

    const calls = mocks.regionIpc.requestTranslation.mock.calls;
    const last = calls[calls.length - 1][0];
    expect(last.sourceText).toBe("Hallo");
    expect(last.provider).toBe("anthropic");
    expect(last.model).toBe("claude-sonnet-4-5");
  });

  it("surfaces a translation error with an alert and a re-translate escape hatch", async () => {
    await renderPreview();
    emitOcr({ requestId: "p1", sourceText: "Hallo", lowConfidence: false });
    expect(screen.getByText("Translating...")).toBeInTheDocument();

    const request = mocks.regionIpc.requestTranslation.mock.calls[0][0];
    emitTranslationError({
      requestId: request.requestId,
      message: "provider 503",
    });

    // Localized, plain-text error surfaced as an assertive alert (BR-05); the
    // raw provider message is never shown.
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(
      "Translation failed - please try again or switch provider",
    );
    expect(screen.queryByText(/provider 503/)).toBeNull();
    expect(screen.queryByText("Translating...")).toBeNull();

    // The escape hatch is keyboard-operable and re-issues the request.
    const retranslate = screen.getByRole("button", { name: "Re-translate" });
    expect(retranslate).toBeEnabled();
    await userEvent.click(retranslate);
    expect(mocks.regionIpc.requestTranslation).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Translating...")).toBeInTheDocument();
  });

  it("copy controls put text on the clipboard only (AC-04.8)", async () => {
    await renderPreview();
    emitOcr({ requestId: "p1", sourceText: "Hallo", lowConfidence: false });
    const request = mocks.regionIpc.requestTranslation.mock.calls[0][0];
    emitTranslation({
      requestId: request.requestId,
      translatedText: "Xin chào",
      provider: "gemini",
      model: "m",
    });

    await userEvent.click(
      screen.getByRole("button", { name: "Copy source text" }),
    );
    expect(mocks.copyToClipboard).toHaveBeenCalledWith("Hallo");

    await userEvent.click(
      screen.getByRole("button", { name: "Copy translation" }),
    );
    expect(mocks.copyToClipboard).toHaveBeenCalledWith("Xin chào");

    // aria-live feedback for screen readers
    expect(screen.getByText("Copied to clipboard")).toBeInTheDocument();
  });

  it("Esc dismisses unless pinned; close button always closes (AC-04.3)", async () => {
    const { container } = await renderPreview();
    const root = container.firstElementChild as HTMLElement;

    await userEvent.click(screen.getByRole("button", { name: "Pin overlay" }));
    fireEvent.keyDown(root, { key: "Escape" });
    expect(mocks.regionIpc.closePreview).not.toHaveBeenCalled();

    await userEvent.click(
      screen.getByRole("button", { name: "Unpin overlay" }),
    );
    fireEvent.keyDown(root, { key: "Escape" });
    expect(mocks.regionIpc.closePreview).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(mocks.regionIpc.closePreview).toHaveBeenCalledTimes(2);
  });

  it("live-update switch and opacity slider are keyboard-operable controls (AC-04.3)", async () => {
    await renderPreview();

    const sw = screen.getByRole("switch", { name: /Live update/ });
    expect(sw).toHaveAttribute("aria-checked", "true");
    await userEvent.click(sw);
    expect(mocks.regionIpc.setLiveUpdate).toHaveBeenCalledWith(false);

    const slider = screen.getByRole("slider", { name: "Background opacity" });
    fireEvent.change(slider, { target: { value: "0.5" } });
    const panel = screen.getByRole("dialog", { name: "Region translation" });
    expect(panel.style.getPropertyValue("--overlay-scrim-opacity")).toBe("0.5");
  });

  it("move handle nudges the window with arrow keys (keyboard reposition)", async () => {
    await renderPreview();

    const handle = screen.getByRole("button", {
      name: "Move overlay (arrow keys while focused)",
    });
    handle.focus();
    fireEvent.keyDown(handle, { key: "ArrowRight" });
    fireEvent.keyDown(handle, { key: "ArrowDown" });

    expect(mocks.regionIpc.nudgePreview).toHaveBeenCalledWith(16, 0);
    expect(mocks.regionIpc.nudgePreview).toHaveBeenCalledWith(0, 16);
  });

  it("every icon-only control exposes an aria-label (WCAG 2.1 AA)", async () => {
    await renderPreview();

    for (const button of screen.getAllByRole("button")) {
      const name =
        button.getAttribute("aria-label") ?? button.textContent?.trim();
      expect(name).toBeTruthy();
    }
  });
});
