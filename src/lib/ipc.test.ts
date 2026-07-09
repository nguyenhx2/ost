import { describe, expect, it, vi } from "vitest";

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

import { invokeIpc } from "./ipc";

describe("invokeIpc", () => {
  it("forwards the command and args to tauri invoke and returns the typed result", async () => {
    invokeMock.mockResolvedValueOnce("xin chao");

    const result = await invokeIpc<string>("greet", { name: "OST" });

    expect(invokeMock).toHaveBeenCalledTimes(1);
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
