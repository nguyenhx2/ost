import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  llmIpc: {
    startServer: vi.fn(),
    stopServer: vi.fn(),
    serverStatus: vi.fn(),
  },
}));

vi.mock("../lib/ipc", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/ipc")>();
  return { ...actual, llmIpc: mocks.llmIpc };
});

import { useLlmServer } from "./useLlmServer";

const idleStatus = {
  running: false,
  modelId: null,
  baseUrl: null,
  port: null,
};

const runningStatus = {
  running: true,
  modelId: "hunyuan-mt-7b",
  baseUrl: "http://127.0.0.1:8177",
  port: 8177,
};

beforeEach(() => {
  mocks.llmIpc.startServer.mockReset();
  mocks.llmIpc.stopServer.mockReset().mockResolvedValue(undefined);
  mocks.llmIpc.serverStatus.mockReset().mockResolvedValue({ ...idleStatus });
});

describe("useLlmServer", () => {
  it("loads the current status on mount", async () => {
    mocks.llmIpc.serverStatus.mockResolvedValue({ ...runningStatus });
    const { result } = renderHook(() => useLlmServer());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.status).toEqual(runningStatus);
  });

  it("start() updates the status and calls onStarted with the loopback baseUrl (providers.md WIRING)", async () => {
    mocks.llmIpc.startServer.mockResolvedValue({ ...runningStatus });
    const onStarted = vi.fn();
    const { result } = renderHook(() => useLlmServer(onStarted));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.start("hunyuan-mt-7b");
    });

    expect(mocks.llmIpc.startServer).toHaveBeenCalledWith("hunyuan-mt-7b");
    expect(result.current.status).toEqual(runningStatus);
    expect(onStarted).toHaveBeenCalledWith(runningStatus);
    expect(result.current.error).toBeNull();
    expect(result.current.busy).toBe(false);
  });

  it("surfaces a typed start error (e.g. binaryNotFound) without throwing", async () => {
    mocks.llmIpc.startServer.mockRejectedValue({ kind: "binaryNotFound" });
    const onStarted = vi.fn();
    const { result } = renderHook(() => useLlmServer(onStarted));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.start("hunyuan-mt-7b");
    });

    expect(result.current.error).toBe("binaryNotFound");
    expect(onStarted).not.toHaveBeenCalled();
    expect(result.current.busy).toBe(false);
  });

  it("stop() resets the status to idle (idempotent)", async () => {
    mocks.llmIpc.serverStatus.mockResolvedValue({ ...runningStatus });
    const { result } = renderHook(() => useLlmServer());
    await waitFor(() => expect(result.current.status.running).toBe(true));

    await act(async () => {
      await result.current.stop();
    });

    expect(mocks.llmIpc.stopServer).toHaveBeenCalledTimes(1);
    expect(result.current.status).toEqual(idleStatus);
  });

  it("surfaces a typed stop error without throwing", async () => {
    mocks.llmIpc.stopServer.mockRejectedValue({ kind: "stopFailed" });
    const { result } = renderHook(() => useLlmServer());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.stop();
    });

    expect(result.current.error).toBe("stopFailed");
  });
});
