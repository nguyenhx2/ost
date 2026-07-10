import { describe, expect, it, vi } from "vitest";

const invokeMock = vi.hoisted(() => vi.fn());
const listenMock = vi.hoisted(() => vi.fn());
const writeTextMock = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));
vi.mock("@tauri-apps/api/event", () => ({
  listen: listenMock,
}));
vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({
  writeText: writeTextMock,
}));

import {
  asAudioCommandError,
  asHotkeyCommandError,
  asKeyCommandError,
  audioIpc,
  captionIpc,
  copyToClipboard,
  historyIpc,
  hotkeysIpc,
  invokeIpc,
  keysIpc,
  listenIpc,
  regionIpc,
  settingsIpc,
  type OcrResultPayload,
} from "./ipc";

describe("invokeIpc", () => {
  it("forwards the command and args to tauri invoke and returns the typed result", async () => {
    invokeMock.mockResolvedValueOnce("xin chao");

    const result = await invokeIpc<string>("greet", { name: "OST" });

    expect(invokeMock).toHaveBeenCalledWith("greet", { name: "OST" });
    expect(result).toBe("xin chao");
  });

  it("forwards a command without args", async () => {
    invokeMock.mockClear();
    invokeMock.mockResolvedValueOnce(42);

    const result = await invokeIpc<number>("get_session_count");

    expect(invokeMock).toHaveBeenCalledWith("get_session_count", undefined);
    expect(result).toBe(42);
  });
});

describe("listenIpc", () => {
  it("subscribes and unwraps the event payload", async () => {
    const unlisten = vi.fn();
    let captured: ((e: { payload: OcrResultPayload }) => void) | undefined;
    listenMock.mockImplementationOnce(
      (_event: string, cb: (e: { payload: OcrResultPayload }) => void) => {
        captured = cb;
        return Promise.resolve(unlisten);
      },
    );
    const handler = vi.fn();

    const un = await listenIpc<OcrResultPayload>("region:ocr-result", handler);
    const payload: OcrResultPayload = {
      requestId: "r1",
      sourceText: "hello",
      lowConfidence: false,
    };
    captured?.({ payload });

    expect(listenMock).toHaveBeenCalledWith(
      "region:ocr-result",
      expect.any(Function),
    );
    expect(handler).toHaveBeenCalledWith(payload);
    expect(un).toBe(unlisten);
  });
});

describe("regionIpc", () => {
  it("confirmSelection sends pixel coords only (no image bytes)", async () => {
    invokeMock.mockClear();
    invokeMock.mockResolvedValueOnce(undefined);
    const region = { x: 10, y: 20, width: 300, height: 200 };

    await regionIpc.confirmSelection(region);

    expect(invokeMock).toHaveBeenCalledWith("confirm_region_selection", {
      region,
    });
  });

  it("requestTranslation carries the OCR text and provider/model (AC-02.8)", async () => {
    invokeMock.mockClear();
    invokeMock.mockResolvedValueOnce(undefined);
    const request = {
      requestId: "ui-1",
      sourceText: "hola",
      provider: "gemini",
      model: "gemini-2.5-flash",
    };

    await regionIpc.requestTranslation(request);

    expect(invokeMock).toHaveBeenCalledWith("request_region_translation", {
      request,
    });
  });

  it("cancelSelection invokes the cancel command with no payload", async () => {
    invokeMock.mockClear();
    invokeMock.mockResolvedValueOnce(undefined);

    await regionIpc.cancelSelection();

    expect(invokeMock).toHaveBeenCalledWith(
      "cancel_region_selection",
      undefined,
    );
  });
});

describe("keysIpc (FR-03)", () => {
  it("statuses invokes the masked-status command", async () => {
    invokeMock.mockClear();
    invokeMock.mockResolvedValueOnce([
      { provider_id: "gemini", key_present: true },
    ]);
    const result = await keysIpc.statuses();
    expect(invokeMock).toHaveBeenCalledWith("provider_key_statuses", undefined);
    expect(result).toEqual([{ provider_id: "gemini", key_present: true }]);
  });

  it("saveKey sends the provider and key down and returns the outcome", async () => {
    invokeMock.mockClear();
    invokeMock.mockResolvedValueOnce({ status: "valid" });
    const outcome = await keysIpc.saveKey("gemini", "FAKE-key");
    expect(invokeMock).toHaveBeenCalledWith("save_provider_key", {
      provider: "gemini",
      key: "FAKE-key",
    });
    expect(outcome).toEqual({ status: "valid" });
  });

  it("checkKey invokes the check command with the provider only", async () => {
    invokeMock.mockClear();
    invokeMock.mockResolvedValueOnce({ status: "valid" });
    await keysIpc.checkKey("gemini");
    expect(invokeMock).toHaveBeenCalledWith("check_provider_key", {
      provider: "gemini",
    });
  });

  it("deleteKey invokes the delete command", async () => {
    invokeMock.mockClear();
    invokeMock.mockResolvedValueOnce(undefined);
    await keysIpc.deleteKey("openai");
    expect(invokeMock).toHaveBeenCalledWith("delete_provider_key", {
      provider: "openai",
    });
  });
});

describe("asKeyCommandError", () => {
  it("passes a typed kind through", () => {
    expect(asKeyCommandError({ kind: "quota" })).toEqual({ kind: "quota" });
  });

  it("maps an untyped failure to the provider kind", () => {
    expect(asKeyCommandError(new Error("boom"))).toEqual({ kind: "provider" });
    expect(asKeyCommandError("nope")).toEqual({ kind: "provider" });
    expect(asKeyCommandError(null)).toEqual({ kind: "provider" });
  });
});

describe("settingsIpc", () => {
  it("open invokes the open_settings command", async () => {
    invokeMock.mockClear();
    invokeMock.mockResolvedValueOnce(undefined);
    await settingsIpc.open();
    expect(invokeMock).toHaveBeenCalledWith("open_settings", undefined);
  });
});

describe("historyIpc", () => {
  it("open invokes the open_history command", async () => {
    invokeMock.mockClear();
    invokeMock.mockResolvedValueOnce(undefined);
    await historyIpc.open();
    expect(invokeMock).toHaveBeenCalledWith("open_history", undefined);
  });
});

describe("hotkeysIpc (FR-04, AC-04.1)", () => {
  const config = {
    toggleAudio: "Ctrl+Alt+A",
    regionSelect: "Ctrl+Alt+R",
    toggleOverlay: "Ctrl+Alt+O",
  };

  it("get invokes get_hotkey_config", async () => {
    invokeMock.mockClear();
    invokeMock.mockResolvedValueOnce(config);
    const result = await hotkeysIpc.get();
    expect(invokeMock).toHaveBeenCalledWith("get_hotkey_config", undefined);
    expect(result).toEqual(config);
  });

  it("set sends the config and returns the applied one", async () => {
    invokeMock.mockClear();
    invokeMock.mockResolvedValueOnce(config);
    await hotkeysIpc.set(config);
    expect(invokeMock).toHaveBeenCalledWith("set_hotkey_config", { config });
  });
});

describe("asHotkeyCommandError", () => {
  it("passes a typed kind + action through", () => {
    expect(
      asHotkeyCommandError({ kind: "conflict", action: "regionSelect" }),
    ).toEqual({ kind: "conflict", action: "regionSelect" });
  });

  it("defaults action to null when absent", () => {
    expect(asHotkeyCommandError({ kind: "store" })).toEqual({
      kind: "store",
      action: null,
    });
  });

  it("maps an untyped failure to the store kind", () => {
    expect(asHotkeyCommandError(new Error("boom"))).toEqual({
      kind: "store",
      action: null,
    });
  });
});

describe("audioIpc (FR-01)", () => {
  it("start sends the session request NAMES only (no key, no audio)", async () => {
    invokeMock.mockClear();
    invokeMock.mockResolvedValueOnce(undefined);
    const request = {
      provider: "gemini",
      model: "gemini-2.5-flash",
      sourceLanguage: "ja",
      targetLanguage: "vi",
    };

    await audioIpc.start(request);

    expect(invokeMock).toHaveBeenCalledWith("start_audio_session", { request });
    // The request never carries a key or audio field.
    const [, args] = invokeMock.mock.calls[0] as [string, { request: unknown }];
    const json = JSON.stringify(args).toLowerCase();
    expect(json).not.toContain("key");
    expect(json).not.toContain("audio");
  });

  it("stop invokes the stop command with no payload", async () => {
    invokeMock.mockClear();
    invokeMock.mockResolvedValueOnce(undefined);
    await audioIpc.stop();
    expect(invokeMock).toHaveBeenCalledWith("stop_audio_session", undefined);
  });
});

describe("captionIpc (FR-01)", () => {
  it("openOverlay carries the session request", async () => {
    invokeMock.mockClear();
    invokeMock.mockResolvedValueOnce(undefined);
    const request = { provider: "gemini", model: "m" };
    await captionIpc.openOverlay(request);
    expect(invokeMock).toHaveBeenCalledWith("open_caption_overlay", {
      request,
    });
  });

  it("nudgeOverlay forwards the clamp-side delta", async () => {
    invokeMock.mockClear();
    invokeMock.mockResolvedValueOnce(undefined);
    await captionIpc.nudgeOverlay(16, 0);
    expect(invokeMock).toHaveBeenCalledWith("nudge_caption_overlay", {
      dx: 16,
      dy: 0,
    });
  });
});

describe("asAudioCommandError", () => {
  it("passes a typed kind through", () => {
    expect(asAudioCommandError({ kind: "noProviderKey" })).toEqual({
      kind: "noProviderKey",
    });
  });

  it("maps an untyped failure to a capture kind", () => {
    expect(asAudioCommandError(new Error("boom"))).toEqual({ kind: "capture" });
    expect(asAudioCommandError(null)).toEqual({ kind: "capture" });
  });
});

describe("copyToClipboard (AC-04.8)", () => {
  it("writes the text to the clipboard plugin and does nothing else", async () => {
    writeTextMock.mockResolvedValueOnce(undefined);

    await copyToClipboard("bản dịch");

    expect(writeTextMock).toHaveBeenCalledWith("bản dịch");
    expect(invokeMock).not.toHaveBeenCalledWith(
      expect.stringMatching(/send|type|click/),
      expect.anything(),
    );
  });
});
