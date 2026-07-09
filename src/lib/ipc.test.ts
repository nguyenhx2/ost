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
  copyToClipboard,
  invokeIpc,
  listenIpc,
  regionIpc,
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
