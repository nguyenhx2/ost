import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mocks = vi.hoisted(() => ({
  keysIpc: {
    statuses: vi.fn(),
  },
  modelIpc: {
    consentStatus: vi.fn(),
    grantConsent: vi.fn(),
    revokeConsent: vi.fn(),
  },
  audioIpc: {
    start: vi.fn(),
    stop: vi.fn(),
  },
  captionIpc: {
    openOverlay: vi.fn(),
    closeOverlay: vi.fn(),
    nudgeOverlay: vi.fn(),
  },
  hotkeysIpc: {
    get: vi.fn(),
    set: vi.fn(),
  },
  sttIpc: {
    listModels: vi.fn(),
    requestSwitch: vi.fn(),
    confirmSwitch: vi.fn(),
  },
  providersIpc: {
    pickerMetadata: vi.fn(),
    checkLocalConnection: vi.fn(),
  },
  regionIpc: {
    startSelection: vi.fn(),
  },
  settingsIpc: {
    open: vi.fn(),
  },
  historyIpc: {
    open: vi.fn(),
  },
  listenIpc: vi.fn(),
  loadProviderSettings: vi.fn(),
  saveProviderSettings: vi.fn(),
}));

vi.mock("./lib/ipc", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./lib/ipc")>();
  return {
    ...actual,
    keysIpc: mocks.keysIpc,
    modelIpc: mocks.modelIpc,
    audioIpc: mocks.audioIpc,
    captionIpc: mocks.captionIpc,
    hotkeysIpc: mocks.hotkeysIpc,
    sttIpc: mocks.sttIpc,
    providersIpc: mocks.providersIpc,
    regionIpc: mocks.regionIpc,
    settingsIpc: mocks.settingsIpc,
    historyIpc: mocks.historyIpc,
    listenIpc: mocks.listenIpc,
  };
});

vi.mock("./lib/settings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./lib/settings")>();
  return {
    ...actual,
    loadProviderSettings: mocks.loadProviderSettings,
    saveProviderSettings: mocks.saveProviderSettings,
  };
});

import {
  DEFAULT_PROVIDER_SETTINGS,
  type ProviderSettings,
} from "./lib/settings";
import { WHISPER_MODEL_SET_ID, type SttModelInfo } from "./lib/ipc";
import App from "./App";

function statusList(present: Partial<Record<string, boolean>> = {}) {
  return [
    { provider_id: "gemini", key_present: !!present.gemini },
    { provider_id: "anthropic", key_present: !!present.anthropic },
    { provider_id: "openai", key_present: !!present.openai },
    { provider_id: "openrouter", key_present: !!present.openrouter },
  ];
}

function sttModel(overrides: Partial<SttModelInfo> = {}): SttModelInfo {
  return {
    id: "base",
    label: "Base",
    approxDownloadBytes: 142_000_000,
    approxRamBytes: 388_000_000,
    downloaded: true,
    allowedByProbe: true,
    requiresCuda: false,
    current: true,
    ...overrides,
  };
}

function providerPickerMetadata() {
  return [
    { provider_id: "gemini", display_name: "Gemini", requires_base_url: false },
    {
      provider_id: "anthropic",
      display_name: "Anthropic (Claude)",
      requires_base_url: false,
    },
    { provider_id: "openai", display_name: "OpenAI", requires_base_url: false },
    {
      provider_id: "openrouter",
      display_name: "OpenRouter",
      requires_base_url: false,
    },
  ];
}

function whisperStatus(granted: boolean) {
  return {
    modelSetId: WHISPER_MODEL_SET_ID,
    granted,
    disclosure: {
      modelSetId: WHISPER_MODEL_SET_ID,
      displayName: "Whisper base (recommended)",
      hostName: "Hugging Face",
      hostDomain: "huggingface.co",
      artifacts: [{ filename: "ggml-base.bin", approxSizeBytes: 142_000_000 }],
      totalApproxSizeBytes: 142_000_000,
      destination: "~/.cache/whisper",
    },
  };
}

function providerSettings(
  overrides: Partial<ProviderSettings> = {},
): ProviderSettings {
  return { ...DEFAULT_PROVIDER_SETTINGS, ...overrides };
}

beforeEach(() => {
  mocks.keysIpc.statuses.mockReset().mockResolvedValue(statusList());
  mocks.modelIpc.consentStatus
    .mockReset()
    .mockResolvedValue(whisperStatus(true));
  mocks.modelIpc.grantConsent.mockReset().mockResolvedValue(undefined);
  mocks.modelIpc.revokeConsent.mockReset().mockResolvedValue(undefined);
  mocks.audioIpc.start.mockReset().mockResolvedValue(undefined);
  mocks.audioIpc.stop.mockReset().mockResolvedValue(undefined);
  mocks.captionIpc.openOverlay.mockReset().mockResolvedValue(undefined);
  mocks.captionIpc.closeOverlay.mockReset().mockResolvedValue(undefined);
  mocks.captionIpc.nudgeOverlay.mockReset().mockResolvedValue(undefined);
  mocks.regionIpc.startSelection.mockReset().mockResolvedValue(undefined);
  mocks.settingsIpc.open.mockReset().mockResolvedValue(undefined);
  mocks.historyIpc.open.mockReset().mockResolvedValue(undefined);
  mocks.loadProviderSettings.mockReset().mockResolvedValue(providerSettings());
  mocks.saveProviderSettings.mockReset().mockResolvedValue(undefined);
  mocks.hotkeysIpc.get.mockReset().mockResolvedValue({
    toggleAudio: "Ctrl+Alt+A",
    regionSelect: "Ctrl+Alt+R",
    toggleOverlay: "Ctrl+Alt+O",
  });
  mocks.hotkeysIpc.set.mockReset().mockResolvedValue(undefined);
  mocks.sttIpc.listModels.mockReset().mockResolvedValue([sttModel()]);
  mocks.sttIpc.requestSwitch.mockReset();
  mocks.sttIpc.confirmSwitch.mockReset();
  mocks.providersIpc.pickerMetadata
    .mockReset()
    .mockResolvedValue(providerPickerMetadata());
  mocks.providersIpc.checkLocalConnection.mockReset();
  mocks.listenIpc.mockReset().mockResolvedValue(() => {});
});

describe("App (home screen, FR-04 TASK-028)", () => {
  it("renders the title and the four primary actions with their hotkeys", async () => {
    render(<App />);

    expect(screen.getByText("OST")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText("Translate a screen region")).toBeInTheDocument(),
    );
    expect(
      screen.getByText("Start / stop live audio translation"),
    ).toBeInTheDocument();
    expect(screen.getByText("Settings")).toBeInTheDocument();
    expect(screen.getByText("History")).toBeInTheDocument();

    // Only the two hotkey-bound actions show a hotkey badge.
    expect(screen.getByText("Ctrl+Alt+R")).toBeInTheDocument();
    expect(screen.getByText("Ctrl+Alt+A")).toBeInTheDocument();
  });

  it("shows the active provider/model and the current STT tier + downloaded status", async () => {
    mocks.loadProviderSettings.mockResolvedValue(
      providerSettings({ defaultProvider: "gemini" }),
    );
    mocks.sttIpc.listModels.mockResolvedValue([
      sttModel({ id: "base", current: true, downloaded: true }),
    ]);

    render(<App />);

    await waitFor(() =>
      expect(
        screen.getByText(/Gemini \/ gemini-2\.5-flash/),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText("Base (recommended)")).toBeInTheDocument();
    expect(screen.getByText("Downloaded")).toBeInTheDocument();
  });

  it("shows the no-key notice with an Open Settings affordance when no key is configured", async () => {
    mocks.keysIpc.statuses.mockResolvedValue(statusList());
    render(<App />);

    await waitFor(() =>
      expect(
        screen.getByText(
          "No provider key is configured yet - open Settings to add one",
        ),
      ).toBeInTheDocument(),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Open Settings" }),
    );
    expect(mocks.settingsIpc.open).toHaveBeenCalledTimes(1);
  });

  it("does not show the no-key notice when at least one key is configured", async () => {
    mocks.keysIpc.statuses.mockResolvedValue(statusList({ gemini: true }));
    render(<App />);

    await waitFor(() =>
      expect(screen.getByText("Translate a screen region")).toBeInTheDocument(),
    );
    expect(
      screen.queryByText(
        "No provider key is configured yet - open Settings to add one",
      ),
    ).not.toBeInTheDocument();
  });

  it("wires the region-select action to the typed IPC command", async () => {
    render(<App />);
    await waitFor(() =>
      expect(screen.getByText("Translate a screen region")).toBeInTheDocument(),
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Select region" }),
    );
    expect(mocks.regionIpc.startSelection).toHaveBeenCalledTimes(1);
  });

  it("wires the Settings and History actions to the typed IPC commands", async () => {
    render(<App />);
    await waitFor(() =>
      expect(screen.getByText("Settings")).toBeInTheDocument(),
    );

    await userEvent.click(
      screen.getByRole("button", { name: "View Settings" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Open History" }));
    expect(mocks.settingsIpc.open).toHaveBeenCalledTimes(1);
    expect(mocks.historyIpc.open).toHaveBeenCalledTimes(1);
  });

  it("starts a session and reflects the running state, then stops it", async () => {
    render(<App />);
    await waitFor(() =>
      expect(
        screen.getByText("Start / stop live audio translation"),
      ).toBeInTheDocument(),
    );

    await userEvent.click(screen.getByRole("button", { name: "Start" }));

    await waitFor(() =>
      expect(mocks.captionIpc.openOverlay).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: "gemini",
          model: DEFAULT_PROVIDER_SETTINGS.models.gemini,
        }),
      ),
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Stop" })).toBeInTheDocument(),
    );
    expect(screen.getAllByText("Running").length).toBeGreaterThan(0);

    await userEvent.click(screen.getByRole("button", { name: "Stop" }));
    await waitFor(() => expect(mocks.audioIpc.stop).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Start" })).toBeInTheDocument(),
    );
  });
});
