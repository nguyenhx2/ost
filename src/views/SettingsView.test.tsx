import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mocks = vi.hoisted(() => ({
  keysIpc: {
    statuses: vi.fn(),
    saveKey: vi.fn(),
    checkKey: vi.fn(),
    deleteKey: vi.fn(),
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
  listenIpc: vi.fn(),
  loadProviderSettings: vi.fn(),
  saveProviderSettings: vi.fn(),
  isHistoryEnabled: vi.fn(),
  setHistoryEnabled: vi.fn(),
}));

vi.mock("../lib/ipc", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/ipc")>();
  return {
    ...actual,
    keysIpc: mocks.keysIpc,
    modelIpc: mocks.modelIpc,
    audioIpc: mocks.audioIpc,
    captionIpc: mocks.captionIpc,
    hotkeysIpc: mocks.hotkeysIpc,
    sttIpc: mocks.sttIpc,
    providersIpc: mocks.providersIpc,
    listenIpc: mocks.listenIpc,
  };
});

vi.mock("../lib/settings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/settings")>();
  return {
    ...actual,
    loadProviderSettings: mocks.loadProviderSettings,
    saveProviderSettings: mocks.saveProviderSettings,
  };
});

vi.mock("../lib/history", () => ({
  HISTORY_ENABLED_DEFAULT: true,
  isHistoryEnabled: mocks.isHistoryEnabled,
  setHistoryEnabled: mocks.setHistoryEnabled,
}));

import { DEFAULT_PROVIDER_SETTINGS } from "../lib/settings";
import {
  OCR_MODEL_SET_ID,
  WHISPER_MODEL_SET_ID,
  type ModelConsentStatus,
} from "../lib/ipc";
import { SettingsView } from "./SettingsView";

function statusList(present: Partial<Record<string, boolean>> = {}) {
  return [
    { provider_id: "gemini", key_present: !!present.gemini },
    { provider_id: "anthropic", key_present: !!present.anthropic },
    { provider_id: "openai", key_present: !!present.openai },
    { provider_id: "openrouter", key_present: !!present.openrouter },
  ];
}

function consentStatus(granted: boolean): ModelConsentStatus {
  return {
    modelSetId: OCR_MODEL_SET_ID,
    granted,
    disclosure: {
      modelSetId: OCR_MODEL_SET_ID,
      displayName: "PP-OCRv5 recognition model",
      hostName: "ModelScope",
      hostDomain: "modelscope.cn",
      artifacts: [{ filename: "rec.onnx", approxSizeBytes: 16_000_000 }],
      totalApproxSizeBytes: 16_000_000,
      destination: "~/.oar",
    },
  };
}

function sttModel(overrides: Partial<import("../lib/ipc").SttModelInfo> = {}) {
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

function defaultSttModels() {
  return [
    sttModel({ id: "tiny", label: "Tiny", downloaded: true, current: false }),
    sttModel(),
    sttModel({
      id: "small",
      label: "Small",
      downloaded: false,
      current: false,
      approxDownloadBytes: 466_000_000,
      approxRamBytes: 2_000_000_000,
    }),
    sttModel({
      id: "large-v3-turbo",
      label: "Large v3 turbo",
      downloaded: false,
      current: false,
      allowedByProbe: false,
      approxDownloadBytes: 1_600_000_000,
      approxRamBytes: 4_000_000_000,
    }),
    sttModel({
      id: "large-v3",
      label: "Large v3",
      downloaded: false,
      current: false,
      allowedByProbe: false,
      requiresCuda: true,
      approxDownloadBytes: 3_900_000_000,
      approxRamBytes: 4_200_000_000,
    }),
  ];
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
    {
      provider_id: "local_openai",
      display_name: "Custom (local, OpenAI-compatible)",
      requires_base_url: true,
    },
  ];
}

function whisperStatus(granted: boolean): ModelConsentStatus {
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

/**
 * Id-aware consent-status mock: OCR (useModelConsent) and whisper
 * (useAudioSession) both query this on mount, so the response must depend on the
 * requested id. `ocrGranted` is mutable so the revoke tests can flip it.
 */
let ocrGranted = true;
let whisperGranted = true;
function consentStatusForId(id: string): ModelConsentStatus {
  return id === WHISPER_MODEL_SET_ID
    ? whisperStatus(whisperGranted)
    : consentStatus(ocrGranted);
}

beforeEach(() => {
  ocrGranted = true;
  whisperGranted = true;
  mocks.keysIpc.statuses.mockReset().mockResolvedValue(statusList());
  mocks.keysIpc.saveKey.mockReset();
  mocks.keysIpc.checkKey.mockReset();
  mocks.keysIpc.deleteKey.mockReset().mockResolvedValue(undefined);
  mocks.modelIpc.consentStatus
    .mockReset()
    .mockImplementation((id: string) =>
      Promise.resolve(consentStatusForId(id)),
    );
  mocks.modelIpc.grantConsent.mockReset().mockResolvedValue(undefined);
  mocks.modelIpc.revokeConsent.mockReset().mockResolvedValue(undefined);
  mocks.audioIpc.start.mockReset().mockResolvedValue(undefined);
  mocks.audioIpc.stop.mockReset().mockResolvedValue(undefined);
  mocks.captionIpc.openOverlay.mockReset().mockResolvedValue(undefined);
  mocks.captionIpc.closeOverlay.mockReset().mockResolvedValue(undefined);
  mocks.captionIpc.nudgeOverlay.mockReset().mockResolvedValue(undefined);
  mocks.loadProviderSettings
    .mockReset()
    .mockResolvedValue({ ...DEFAULT_PROVIDER_SETTINGS });
  mocks.saveProviderSettings.mockReset().mockResolvedValue(undefined);
  mocks.isHistoryEnabled.mockReset().mockResolvedValue(true);
  mocks.setHistoryEnabled.mockReset().mockResolvedValue(undefined);
  mocks.hotkeysIpc.get.mockReset().mockResolvedValue({
    toggleAudio: "Ctrl+Alt+A",
    regionSelect: "Ctrl+Alt+R",
    toggleOverlay: "Ctrl+Alt+O",
  });
  mocks.hotkeysIpc.set.mockReset().mockResolvedValue(undefined);
  mocks.sttIpc.listModels.mockReset().mockResolvedValue(defaultSttModels());
  mocks.sttIpc.requestSwitch.mockReset();
  mocks.sttIpc.confirmSwitch.mockReset();
  mocks.providersIpc.pickerMetadata
    .mockReset()
    .mockResolvedValue(providerPickerMetadata());
  mocks.providersIpc.checkLocalConnection.mockReset();
  // useAudioSession subscribes to `audio:stopped`; the STT picker subscribes
  // to `stt:model-download-progress` - both share this noop unlisten mock.
  mocks.listenIpc.mockReset().mockResolvedValue(() => {});
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

  it("lists a consented model set with a revoke control (BR-08)", async () => {
    render(<SettingsView />);
    await waitFor(() =>
      expect(screen.getByText("Model downloads")).toBeInTheDocument(),
    );
    // The granted model set is listed by its (plain-text) display name.
    expect(screen.getByText("PP-OCRv5 recognition model")).toBeInTheDocument();
    // The revoke control is an icon button with an accessible name.
    expect(
      screen.getByRole("button", { name: "Revoke consent" }),
    ).toBeInTheDocument();
  });

  it("revoke calls revoke_model_consent for the model set id", async () => {
    // After a successful revoke the gate is closed again (granted:false); the
    // id-aware mock reads the flipped `ocrGranted` on the refresh.
    mocks.modelIpc.revokeConsent.mockImplementation(async () => {
      ocrGranted = false;
    });
    render(<SettingsView />);
    await waitFor(() =>
      expect(
        screen.getByText("PP-OCRv5 recognition model"),
      ).toBeInTheDocument(),
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Revoke consent" }),
    );

    await waitFor(() =>
      expect(mocks.modelIpc.revokeConsent).toHaveBeenCalledWith(
        OCR_MODEL_SET_ID,
      ),
    );
    // The IPC surface carries only the model set id - never a key/secret.
    expect(mocks.modelIpc.revokeConsent).toHaveBeenCalledWith(
      expect.not.stringContaining("key"),
    );
    // After revoke the entry drops out and the empty-state copy shows: the
    // next download will re-prompt (fail-closed preserved).
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Revoke consent" }),
      ).toBeNull(),
    );
    expect(
      screen.getByText(
        "No model downloads have been allowed yet. You will be asked before the first download.",
      ),
    ).toBeInTheDocument();
  });

  it("shows the empty state when no model download is consented", async () => {
    ocrGranted = false;
    render(<SettingsView />);
    await waitFor(() =>
      expect(screen.getByText("Model downloads")).toBeInTheDocument(),
    );
    expect(screen.queryByRole("button", { name: "Revoke consent" })).toBeNull();
    expect(
      screen.getByText(
        "No model downloads have been allowed yet. You will be asked before the first download.",
      ),
    ).toBeInTheDocument();
  });

  it("surfaces a revoke failure and keeps the consent entry", async () => {
    mocks.modelIpc.revokeConsent.mockRejectedValue(new Error("keychain"));
    render(<SettingsView />);
    await waitFor(() =>
      expect(
        screen.getByText("PP-OCRv5 recognition model"),
      ).toBeInTheDocument(),
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Revoke consent" }),
    );

    await waitFor(() =>
      expect(
        screen.getByText("Could not revoke consent - please try again"),
      ).toBeInTheDocument(),
    );
    // Fail-closed preserved: the entry is still listed (consent unchanged).
    expect(
      screen.getByRole("button", { name: "Revoke consent" }),
    ).toBeInTheDocument();
  });

  it("shows the history toggle ON by default (BR-06/AC-04.6)", async () => {
    render(<SettingsView />);
    await waitFor(() =>
      expect(screen.getByText("Translation history")).toBeInTheDocument(),
    );
    const toggle = screen.getByRole("switch", {
      name: "Record translation history",
    });
    await waitFor(() => expect(toggle).toHaveAttribute("aria-checked", "true"));
  });

  it("persists disabling the history toggle (AC-04.6)", async () => {
    render(<SettingsView />);
    const toggle = await screen.findByRole("switch", {
      name: "Record translation history",
    });
    await waitFor(() => expect(toggle).toHaveAttribute("aria-checked", "true"));

    await userEvent.click(toggle);

    await waitFor(() =>
      expect(mocks.setHistoryEnabled).toHaveBeenCalledWith(false),
    );
    expect(toggle).toHaveAttribute("aria-checked", "false");
  });

  it("starts a session with the pinned source and vi target (AC-01.4/01.5)", async () => {
    render(<SettingsView />);
    await waitFor(() =>
      expect(screen.getByText("Live audio translation")).toBeInTheDocument(),
    );

    // Pin the source language to Japanese (default is Auto).
    await userEvent.click(
      screen.getByRole("button", { name: "Source language" }),
    );
    await userEvent.click(screen.getByRole("option", { name: "Japanese" }));

    // Target defaults to Vietnamese (AC-01.5).
    await userEvent.click(
      screen.getByRole("button", { name: "Start audio session" }),
    );

    // The overlay is opened with the request (NAMES only) that carries the
    // pinned source + vi target; the overlay window owns start_audio_session.
    await waitFor(() =>
      expect(mocks.captionIpc.openOverlay).toHaveBeenCalledWith({
        provider: "gemini",
        model: "gemini-2.5-flash",
        sourceLanguage: "ja",
        targetLanguage: "vi",
      }),
    );
    // No key/audio ever crosses the request.
    const arg = mocks.captionIpc.openOverlay.mock.calls[0][0];
    const json = JSON.stringify(arg).toLowerCase();
    expect(json).not.toContain("key");
    expect(json).not.toContain("audio");
  });

  it("stops the session and closes the overlay (AC-01.10)", async () => {
    render(<SettingsView />);
    await waitFor(() =>
      expect(screen.getByText("Live audio translation")).toBeInTheDocument(),
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Start audio session" }),
    );
    const stop = await screen.findByRole("button", {
      name: "Stop audio session",
    });
    await userEvent.click(stop);

    await waitFor(() => expect(mocks.audioIpc.stop).toHaveBeenCalledTimes(1));
    expect(mocks.captionIpc.closeOverlay).toHaveBeenCalledTimes(1);
  });

  it("shows the whisper first-run consent and grants the download (AC-01.8)", async () => {
    whisperGranted = false;
    render(<SettingsView />);
    await waitFor(() =>
      expect(screen.getByText("Live audio translation")).toBeInTheDocument(),
    );

    const review = await screen.findByRole("button", {
      name: "Review model download",
    });
    await userEvent.click(review);

    // The shared disclosure dialog opens with the WHISPER title (not OCR).
    const dialog = await screen.findByRole("dialog", {
      name: "Download speech-to-text model",
    });
    expect(dialog).toBeInTheDocument();

    await userEvent.click(
      within(dialog).getByRole("button", { name: "Allow download" }),
    );

    await waitFor(() =>
      expect(mocks.modelIpc.grantConsent).toHaveBeenCalledWith(
        WHISPER_MODEL_SET_ID,
      ),
    );
  });

  it("displays the hardware-recommended whisper model (AC-01.8)", async () => {
    render(<SettingsView />);
    await waitFor(() =>
      expect(screen.getByText("Live audio translation")).toBeInTheDocument(),
    );
    // The recommended model name comes from the whisper disclosure (plain text).
    expect(screen.getByText("Whisper base (recommended)")).toBeInTheDocument();
    expect(
      screen.getByText("Speech model download allowed"),
    ).toBeInTheDocument();
  });

  it("lists the STT engine picker with hardware-gated disabled entries (TASK-026)", async () => {
    render(<SettingsView />);
    const sttTrigger = await screen.findByRole("button", {
      name: "Speech-to-text engine",
    });

    await userEvent.click(sttTrigger);
    const listbox = screen.getByRole("listbox", {
      name: "Speech-to-text engine",
    });

    // The current model is marked; a hardware-gated tier is disabled.
    expect(
      within(listbox).getByRole("option", { name: /Base \(recommended\)/ }),
    ).toHaveAttribute("aria-selected", "true");
    const gated = within(listbox).getByRole("option", {
      name: /Large v3 turbo/,
    });
    expect(gated).toHaveAttribute("aria-disabled", "true");

    // Cloud STT entries are listed, always disabled, pending ADR-005.
    const cloud = within(listbox).getByRole("option", {
      name: /Google Cloud STT/,
    });
    expect(cloud).toHaveAttribute("aria-disabled", "true");
  });

  it("switching to an undownloaded STT tier requires consent before any download (BR-08)", async () => {
    mocks.sttIpc.requestSwitch.mockResolvedValue({
      status: "consentRequired",
      disclosure: {
        modelSetId: "whisper-ggml",
        displayName: "Whisper small",
        hostName: "Hugging Face",
        hostDomain: "huggingface.co",
        artifacts: [
          { filename: "ggml-small.bin", approxSizeBytes: 466_000_000 },
        ],
        totalApproxSizeBytes: 466_000_000,
        destination: "~/.cache/whisper",
      },
    });
    render(<SettingsView />);
    const sttTrigger = await screen.findByRole("button", {
      name: "Speech-to-text engine",
    });

    await userEvent.click(sttTrigger);
    await userEvent.click(screen.getByRole("option", { name: /^Small/ }));

    // Consent dialog opens; the download has NOT started yet.
    const dialog = await screen.findByRole("dialog", {
      name: "Download this speech-to-text tier",
    });
    expect(mocks.sttIpc.confirmSwitch).not.toHaveBeenCalled();

    await userEvent.click(
      within(dialog).getByRole("button", { name: "Allow download" }),
    );

    await waitFor(() =>
      expect(mocks.sttIpc.confirmSwitch).toHaveBeenCalledWith("small"),
    );
  });

  it("declining the STT consent dialog never downloads", async () => {
    mocks.sttIpc.requestSwitch.mockResolvedValue({
      status: "consentRequired",
      disclosure: {
        modelSetId: "whisper-ggml",
        displayName: "Whisper small",
        hostName: "Hugging Face",
        hostDomain: "huggingface.co",
        artifacts: [
          { filename: "ggml-small.bin", approxSizeBytes: 466_000_000 },
        ],
        totalApproxSizeBytes: 466_000_000,
        destination: "~/.cache/whisper",
      },
    });
    render(<SettingsView />);
    const sttTrigger = await screen.findByRole("button", {
      name: "Speech-to-text engine",
    });

    await userEvent.click(sttTrigger);
    await userEvent.click(screen.getByRole("option", { name: /^Small/ }));

    const dialog = await screen.findByRole("dialog", {
      name: "Download this speech-to-text tier",
    });
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Not now" }),
    );

    expect(mocks.sttIpc.confirmSwitch).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders STT model-download progress from stt:model-download-progress", async () => {
    let progressHandler: ((payload: unknown) => void) | null = null;
    mocks.listenIpc.mockImplementation(
      (event: string, handler: (p: unknown) => void) => {
        if (event === "stt:model-download-progress") {
          progressHandler = handler;
        }
        return Promise.resolve(() => {});
      },
    );
    mocks.sttIpc.requestSwitch.mockResolvedValue({
      status: "consentRequired",
      disclosure: {
        modelSetId: "whisper-ggml",
        displayName: "Whisper small",
        hostName: "Hugging Face",
        hostDomain: "huggingface.co",
        artifacts: [
          { filename: "ggml-small.bin", approxSizeBytes: 466_000_000 },
        ],
        totalApproxSizeBytes: 466_000_000,
        destination: "~/.cache/whisper",
      },
    });
    // Never resolves within this test - only the progress event matters here.
    mocks.sttIpc.confirmSwitch.mockImplementation(
      () => new Promise<void>(() => {}),
    );

    render(<SettingsView />);
    const sttTrigger = await screen.findByRole("button", {
      name: "Speech-to-text engine",
    });
    await userEvent.click(sttTrigger);
    await userEvent.click(screen.getByRole("option", { name: /^Small/ }));
    const dialog = await screen.findByRole("dialog", {
      name: "Download this speech-to-text tier",
    });
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Allow download" }),
    );

    await waitFor(() => expect(progressHandler).not.toBeNull());
    act(() => {
      progressHandler?.({
        modelId: "small",
        downloadedBytes: 233_000_000,
        totalBytes: 466_000_000,
      });
    });

    expect(
      await screen.findByRole("progressbar", {
        name: "Model download progress",
      }),
    ).toHaveAttribute("aria-valuenow", "50");
  });

  it("shows a clear message when switching the STT engine mid-session (sessionActive)", async () => {
    mocks.sttIpc.requestSwitch.mockRejectedValue({ kind: "sessionActive" });
    render(<SettingsView />);
    const sttTrigger = await screen.findByRole("button", {
      name: "Speech-to-text engine",
    });

    await userEvent.click(sttTrigger);
    await userEvent.click(screen.getByRole("option", { name: /^Small/ }));

    await waitFor(() =>
      expect(
        screen.getByText(
          "Cannot change the speech-to-text engine while an audio session is running - stop the session first",
        ),
      ).toBeInTheDocument(),
    );
  });

  it("shows the local OpenAI-compatible provider entry and its base_url field (FR-03.CUSTOM-1)", async () => {
    render(<SettingsView />);
    // Wait for the picker metadata (incl. the local provider) to load before
    // opening the Select, so the option is present when the list opens.
    await waitFor(() =>
      expect(mocks.providersIpc.pickerMetadata).toHaveBeenCalled(),
    );

    const trigger = await screen.findByRole("button", {
      name: "Default provider",
    });
    await userEvent.click(trigger);
    const option = await screen.findByRole("option", {
      name: "Custom (local, OpenAI-compatible)",
    });
    await userEvent.click(option);

    await waitFor(() =>
      expect(
        screen.getByLabelText("Local server address (base_url)"),
      ).toBeInTheDocument(),
    );
    expect(mocks.saveProviderSettings).toHaveBeenCalledWith(
      expect.objectContaining({ defaultProvider: "local_openai" }),
    );
  });

  it("persists the local provider base_url and model id", async () => {
    mocks.loadProviderSettings.mockResolvedValue({
      ...DEFAULT_PROVIDER_SETTINGS,
      defaultProvider: "local_openai",
    });
    render(<SettingsView />);
    const baseUrlField = await screen.findByLabelText(
      "Local server address (base_url)",
    );
    await userEvent.type(baseUrlField, "http://127.0.0.1:1234");

    await waitFor(() =>
      expect(mocks.saveProviderSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          localOpenAi: expect.objectContaining({
            baseUrl: "http://127.0.0.1:1234",
          }),
        }),
      ),
    );
  });

  it("check-connection reports a reachable local server", async () => {
    mocks.loadProviderSettings.mockResolvedValue({
      ...DEFAULT_PROVIDER_SETTINGS,
      defaultProvider: "local_openai",
      localOpenAi: { baseUrl: "http://127.0.0.1:1234", modelId: "llama-3" },
    });
    mocks.providersIpc.checkLocalConnection.mockResolvedValue(undefined);
    render(<SettingsView />);
    await screen.findByLabelText("Local server address (base_url)");

    await userEvent.click(
      screen.getByRole("button", { name: "Check connection" }),
    );

    await waitFor(() =>
      expect(
        screen.getByText("Connected - the local server answered"),
      ).toBeInTheDocument(),
    );
  });

  it("check-connection distinguishes 'local server not running' from a generic error", async () => {
    mocks.loadProviderSettings.mockResolvedValue({
      ...DEFAULT_PROVIDER_SETTINGS,
      defaultProvider: "local_openai",
      localOpenAi: { baseUrl: "http://127.0.0.1:1234", modelId: "llama-3" },
    });
    mocks.providersIpc.checkLocalConnection.mockRejectedValue({
      kind: "localServerUnreachable",
    });
    render(<SettingsView />);
    await screen.findByLabelText("Local server address (base_url)");

    await userEvent.click(
      screen.getByRole("button", { name: "Check connection" }),
    );

    await waitFor(() =>
      expect(
        screen.getByText(
          "The local server is not running - start it and try again",
        ),
      ).toBeInTheDocument(),
    );
  });

  it("check-connection reports an invalid (non-loopback) base_url distinctly", async () => {
    mocks.loadProviderSettings.mockResolvedValue({
      ...DEFAULT_PROVIDER_SETTINGS,
      defaultProvider: "local_openai",
      localOpenAi: { baseUrl: "https://example.com", modelId: "llama-3" },
    });
    mocks.providersIpc.checkLocalConnection.mockRejectedValue({
      kind: "invalidBaseUrl",
    });
    render(<SettingsView />);
    await screen.findByLabelText("Local server address (base_url)");

    await userEvent.click(
      screen.getByRole("button", { name: "Check connection" }),
    );

    await waitFor(() =>
      expect(
        screen.getByText(
          "Only a loopback address (127.0.0.1 / localhost) is accepted",
        ),
      ).toBeInTheDocument(),
    );
  });
});
