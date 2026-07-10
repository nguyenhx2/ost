import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { HistoryEntry } from "../lib/history";

const mocks = vi.hoisted(() => ({
  loadHistory: vi.fn(),
  clearHistory: vi.fn().mockResolvedValue(undefined),
  copyToClipboard: vi.fn().mockResolvedValue(undefined),
  subscribeHistoryChanges: vi.fn().mockResolvedValue(() => {}),
}));

vi.mock("../lib/history", () => ({
  loadHistory: mocks.loadHistory,
  clearHistory: mocks.clearHistory,
  subscribeHistoryChanges: mocks.subscribeHistoryChanges,
}));

vi.mock("../lib/ipc", () => ({
  copyToClipboard: mocks.copyToClipboard,
}));

import { HistoryView } from "./HistoryView";

function entry(over: Partial<HistoryEntry> = {}): HistoryEntry {
  return {
    id: "e1",
    sessionType: "region",
    sourceText: "Hello world",
    translatedText: "Xin chao the gioi",
    sourceLanguage: "en",
    targetLanguage: "vi",
    providerId: "openai",
    modelId: "gpt-4.1-mini",
    createdAt: "2026-07-10T10:15:00.000Z",
    ...over,
  };
}

beforeEach(() => {
  mocks.loadHistory.mockReset().mockResolvedValue([entry()]);
  mocks.clearHistory.mockClear();
  mocks.copyToClipboard.mockClear();
});

describe("HistoryView", () => {
  it("lists a saved entry with its source and translation (AC-04.4)", async () => {
    render(<HistoryView />);
    await waitFor(() =>
      expect(screen.getByText("Hello world")).toBeInTheDocument(),
    );
    expect(screen.getByText("Xin chao the gioi")).toBeInTheDocument();
    expect(screen.getByText("openai / gpt-4.1-mini")).toBeInTheDocument();
  });

  it("copies the translation via the per-entry copy control (AC-04.3/AC-04.8)", async () => {
    render(<HistoryView />);
    await waitFor(() =>
      expect(screen.getByText("Hello world")).toBeInTheDocument(),
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Copy translation" }),
    );

    expect(mocks.copyToClipboard).toHaveBeenCalledWith("Xin chao the gioi");
    expect(screen.getByText("Copied to clipboard")).toBeInTheDocument();
  });

  it("clear-all is always visible and wipes the store after confirm (AC-04.5)", async () => {
    render(<HistoryView />);
    const clearButton = await screen.findByRole("button", {
      name: /Clear all history/,
    });
    await userEvent.click(clearButton);

    // Confirm dialog appears; nothing is deleted until the user confirms.
    expect(mocks.clearHistory).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Delete everything" }),
    );

    await waitFor(() => expect(mocks.clearHistory).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(
        screen.getByText(
          "No translations yet. Completed translations will appear here.",
        ),
      ).toBeInTheDocument(),
    );
  });

  it("cancelling the confirm does NOT clear the store", async () => {
    render(<HistoryView />);
    const clearButton = await screen.findByRole("button", {
      name: /Clear all history/,
    });
    await userEvent.click(clearButton);
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(mocks.clearHistory).not.toHaveBeenCalled();
    expect(screen.getByText("Hello world")).toBeInTheDocument();
  });

  it("shows the empty state with clear-all disabled when there is no history", async () => {
    mocks.loadHistory.mockResolvedValue([]);
    render(<HistoryView />);
    await waitFor(() =>
      expect(
        screen.getByText(
          "No translations yet. Completed translations will appear here.",
        ),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getByRole("button", { name: /Clear all history/ }),
    ).toBeDisabled();
  });
});
