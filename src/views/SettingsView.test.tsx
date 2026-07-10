import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mocks = vi.hoisted(() => ({
  keysIpc: {
    statuses: vi.fn(),
    saveKey: vi.fn(),
    checkKey: vi.fn(),
    deleteKey: vi.fn(),
  },
  loadProviderSettings: vi.fn(),
  saveProviderSettings: vi.fn(),
}));

vi.mock("../lib/ipc", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/ipc")>();
  return { ...actual, keysIpc: mocks.keysIpc };
});

vi.mock("../lib/settings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/settings")>();
  return {
    ...actual,
    loadProviderSettings: mocks.loadProviderSettings,
    saveProviderSettings: mocks.saveProviderSettings,
  };
});

import { DEFAULT_PROVIDER_SETTINGS } from "../lib/settings";
import { SettingsView } from "./SettingsView";

function statusList(present: Partial<Record<string, boolean>> = {}) {
  return [
    { provider_id: "gemini", key_present: !!present.gemini },
    { provider_id: "anthropic", key_present: !!present.anthropic },
    { provider_id: "openai", key_present: !!present.openai },
    { provider_id: "openrouter", key_present: !!present.openrouter },
  ];
}

beforeEach(() => {
  mocks.keysIpc.statuses.mockReset().mockResolvedValue(statusList());
  mocks.keysIpc.saveKey.mockReset();
  mocks.keysIpc.checkKey.mockReset();
  mocks.keysIpc.deleteKey.mockReset().mockResolvedValue(undefined);
  mocks.loadProviderSettings
    .mockReset()
    .mockResolvedValue({ ...DEFAULT_PROVIDER_SETTINGS });
  mocks.saveProviderSettings.mockReset().mockResolvedValue(undefined);
});

describe("SettingsView", () => {
  it("lists the four providers with a masked status (AC-03.1)", async () => {
    mocks.keysIpc.statuses.mockResolvedValue(statusList({ gemini: true }));
    render(<SettingsView />);

    await waitFor(() =>
      expect(screen.getByText("Providers and API keys")).toBeInTheDocument(),
    );
    expect(screen.getAllByText("Anthropic (Claude)").length).toBeGreaterThan(0);
    expect(screen.getAllByText("OpenAI").length).toBeGreaterThan(0);
    expect(screen.getAllByText("OpenRouter").length).toBeGreaterThan(0);
    // Each provider has a masked key-entry field (AC-03.1).
    expect(screen.getByLabelText("Gemini API key")).toBeInTheDocument();
    // Masked status text is present (not a key value).
    expect(screen.getAllByText("Key configured").length).toBeGreaterThan(0);
  });

  it("saves a validated key and clears the input (AC-03.2/AC-03.4)", async () => {
    mocks.keysIpc.saveKey.mockResolvedValue({ status: "valid" });
    render(<SettingsView />);
    await waitFor(() =>
      expect(screen.getByText("Providers and API keys")).toBeInTheDocument(),
    );

    const field = screen.getByLabelText("Gemini API key") as HTMLInputElement;
    const row = field.closest("li") as HTMLElement;
    await userEvent.type(field, "FAKE-secret-key");
    await userEvent.click(
      within(row).getByRole("button", { name: "Save key" }),
    );

    await waitFor(() =>
      expect(mocks.keysIpc.saveKey).toHaveBeenCalledWith(
        "gemini",
        "FAKE-secret-key",
      ),
    );
    // Input cleared after a successful save (key no longer in the WebView).
    await waitFor(() => expect(field.value).toBe(""));
    expect(screen.getByText("Key validated and saved")).toBeInTheDocument();
  });

  it("keeps the input and shows an actionable message for an invalid key", async () => {
    mocks.keysIpc.saveKey.mockResolvedValue({
      status: "invalid",
      reason: "API key not valid ([REDACTED])",
    });
    render(<SettingsView />);
    await waitFor(() =>
      expect(screen.getByText("Providers and API keys")).toBeInTheDocument(),
    );

    const field = screen.getByLabelText("Gemini API key") as HTMLInputElement;
    const row = field.closest("li") as HTMLElement;
    await userEvent.type(field, "bad-key");
    await userEvent.click(
      within(row).getByRole("button", { name: "Save key" }),
    );

    await waitFor(() =>
      expect(
        screen.getByText("Key is invalid - please check it and enter it again"),
      ).toBeInTheDocument(),
    );
    // Input retained so the user can correct it (human-in-the-loop.md).
    expect(field.value).toBe("bad-key");
    // The raw provider reason is NOT rendered (untrusted DATA).
    expect(screen.queryByText(/REDACTED/)).toBeNull();
  });

  it("surfaces a typed network error message", async () => {
    mocks.keysIpc.saveKey.mockRejectedValue({ kind: "network" });
    render(<SettingsView />);
    await waitFor(() =>
      expect(screen.getByText("Providers and API keys")).toBeInTheDocument(),
    );

    const field = screen.getByLabelText("Gemini API key");
    const row = field.closest("li") as HTMLElement;
    await userEvent.type(field, "FAKE-key");
    await userEvent.click(
      within(row).getByRole("button", { name: "Save key" }),
    );

    await waitFor(() =>
      expect(
        screen.getByText("Network error - could not reach the provider"),
      ).toBeInTheDocument(),
    );
  });

  it("removes a key via the remove control (AC-03.7)", async () => {
    mocks.keysIpc.statuses
      .mockResolvedValueOnce(statusList({ gemini: true }))
      .mockResolvedValue(statusList());
    render(<SettingsView />);
    await waitFor(() =>
      expect(screen.getByText("Providers and API keys")).toBeInTheDocument(),
    );

    const removeButtons = screen.getAllByRole("button", { name: "Remove key" });
    await userEvent.click(removeButtons[0]);
    await waitFor(() =>
      expect(mocks.keysIpc.deleteKey).toHaveBeenCalledWith("gemini"),
    );
  });

  it("renders the fallback order controls (AC-03.6)", async () => {
    render(<SettingsView />);
    await waitFor(() =>
      expect(screen.getByText("Fallback order")).toBeInTheDocument(),
    );
    const upButtons = screen.getAllByRole("button", { name: "Move up" });
    // First provider cannot move up.
    expect(upButtons[0]).toBeDisabled();
    // A later provider can - moving it persists.
    await userEvent.click(upButtons[1]);
    await waitFor(() => expect(mocks.saveProviderSettings).toHaveBeenCalled());
  });

  it("shows a not-configured warning badge in the fallback list", async () => {
    render(<SettingsView />);
    await waitFor(() =>
      expect(screen.getByText("Fallback order")).toBeInTheDocument(),
    );
    const fallback = screen
      .getByText("Fallback order")
      .closest("section") as HTMLElement;
    // No keys configured -> every fallback entry flags "no key".
    expect(within(fallback).getAllByText("no key").length).toBe(4);
  });
});
