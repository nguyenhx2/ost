import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  providersIpc: {
    pickerMetadata: vi.fn(),
    checkLocalConnection: vi.fn(),
  },
}));

vi.mock("../lib/ipc", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/ipc")>();
  return { ...actual, providersIpc: mocks.providersIpc };
});

import { useLocalProviderConnection } from "./useLocalProviderConnection";

beforeEach(() => {
  mocks.providersIpc.checkLocalConnection.mockReset();
});

describe("useLocalProviderConnection", () => {
  it("starts idle", () => {
    const { result } = renderHook(() => useLocalProviderConnection());
    expect(result.current.state).toEqual({ status: "idle" });
  });

  it("reports ok for a reachable local server", async () => {
    mocks.providersIpc.checkLocalConnection.mockResolvedValue(undefined);
    const { result } = renderHook(() => useLocalProviderConnection());

    await act(async () => {
      await result.current.check("http://127.0.0.1:1234");
    });

    expect(mocks.providersIpc.checkLocalConnection).toHaveBeenCalledWith(
      "http://127.0.0.1:1234",
    );
    expect(result.current.state).toEqual({ status: "ok" });
  });

  it("distinguishes localServerUnreachable from a generic error", async () => {
    mocks.providersIpc.checkLocalConnection.mockRejectedValue({
      kind: "localServerUnreachable",
    });
    const { result } = renderHook(() => useLocalProviderConnection());

    await act(async () => {
      await result.current.check("http://127.0.0.1:1234");
    });

    expect(result.current.state).toEqual({
      status: "error",
      kind: "localServerUnreachable",
    });
  });

  it("reports invalidBaseUrl for a non-loopback address", async () => {
    mocks.providersIpc.checkLocalConnection.mockRejectedValue({
      kind: "invalidBaseUrl",
    });
    const { result } = renderHook(() => useLocalProviderConnection());

    await act(async () => {
      await result.current.check("https://example.com");
    });

    expect(result.current.state).toEqual({
      status: "error",
      kind: "invalidBaseUrl",
    });
  });

  it("reset returns to idle", async () => {
    mocks.providersIpc.checkLocalConnection.mockResolvedValue(undefined);
    const { result } = renderHook(() => useLocalProviderConnection());
    await act(async () => {
      await result.current.check("http://127.0.0.1:1234");
    });
    await waitFor(() => expect(result.current.state.status).toBe("ok"));

    act(() => {
      result.current.reset();
    });
    expect(result.current.state).toEqual({ status: "idle" });
  });
});
