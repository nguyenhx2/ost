import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  keysIpc: {
    statuses: vi.fn(),
    saveKey: vi.fn(),
    checkKey: vi.fn(),
    deleteKey: vi.fn(),
  },
}));

vi.mock("../lib/ipc", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/ipc")>();
  return { ...actual, keysIpc: mocks.keysIpc };
});

import { useProviderKeys } from "./useProviderKeys";

function statusList(present: Partial<Record<string, boolean>>) {
  return [
    { provider_id: "gemini", key_present: !!present.gemini },
    { provider_id: "anthropic", key_present: !!present.anthropic },
    { provider_id: "openai", key_present: !!present.openai },
    { provider_id: "openrouter", key_present: !!present.openrouter },
  ];
}

beforeEach(() => {
  mocks.keysIpc.statuses.mockReset().mockResolvedValue(statusList({}));
  mocks.keysIpc.saveKey.mockReset();
  mocks.keysIpc.checkKey.mockReset();
  mocks.keysIpc.deleteKey.mockReset();
});

describe("useProviderKeys", () => {
  it("loads masked statuses on mount (AC-03.1/AC-03.3)", async () => {
    mocks.keysIpc.statuses.mockResolvedValue(statusList({ gemini: true }));
    const { result } = renderHook(() => useProviderKeys());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.statuses.gemini).toBe(true);
    expect(result.current.statuses.openai).toBe(false);
  });

  it("stores a valid key, reports saved, and refreshes status", async () => {
    mocks.keysIpc.saveKey.mockResolvedValue({ status: "valid" });
    mocks.keysIpc.statuses
      .mockResolvedValueOnce(statusList({}))
      .mockResolvedValueOnce(statusList({ gemini: true }));

    const { result } = renderHook(() => useProviderKeys());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let cleared = false;
    await act(async () => {
      cleared = await result.current.saveKey("gemini", "FAKE-key");
    });

    expect(mocks.keysIpc.saveKey).toHaveBeenCalledWith("gemini", "FAKE-key");
    expect(cleared).toBe(true);
    expect(result.current.results.gemini).toEqual({ type: "saved" });
    expect(result.current.statuses.gemini).toBe(true);
  });

  it("does not clear input and flags invalid when the key is rejected (AC-03.4)", async () => {
    mocks.keysIpc.saveKey.mockResolvedValue({
      status: "invalid",
      reason: "API key not valid ([REDACTED])",
    });
    const { result } = renderHook(() => useProviderKeys());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let cleared = true;
    await act(async () => {
      cleared = await result.current.saveKey("gemini", "bad");
    });

    expect(cleared).toBe(false);
    expect(result.current.results.gemini).toEqual({ type: "invalid" });
    // Rejected key never flips the masked status to present.
    expect(result.current.statuses.gemini).toBe(false);
  });

  it("maps a rejected IPC error to a typed error result", async () => {
    mocks.keysIpc.saveKey.mockRejectedValue({ kind: "quota" });
    const { result } = renderHook(() => useProviderKeys());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.saveKey("gemini", "FAKE-key");
    });

    expect(result.current.results.gemini).toEqual({
      type: "error",
      kind: "quota",
    });
  });

  it("reports 'stored' (unvalidated) for providers without a client", async () => {
    mocks.keysIpc.saveKey.mockResolvedValue({ status: "stored" });
    mocks.keysIpc.statuses
      .mockResolvedValueOnce(statusList({}))
      .mockResolvedValueOnce(statusList({ anthropic: true }));
    const { result } = renderHook(() => useProviderKeys());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let cleared = false;
    await act(async () => {
      cleared = await result.current.saveKey("anthropic", "FAKE-key");
    });
    expect(cleared).toBe(true);
    expect(result.current.results.anthropic).toEqual({
      type: "storedUnvalidated",
    });
  });

  it("removes a key and flips status back to not-configured (AC-03.7)", async () => {
    mocks.keysIpc.deleteKey.mockResolvedValue(undefined);
    mocks.keysIpc.statuses
      .mockResolvedValueOnce(statusList({ gemini: true }))
      .mockResolvedValueOnce(statusList({}));
    const { result } = renderHook(() => useProviderKeys());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.removeKey("gemini");
    });
    expect(mocks.keysIpc.deleteKey).toHaveBeenCalledWith("gemini");
    expect(result.current.statuses.gemini).toBe(false);
  });

  it("checks the stored key and reports valid/invalid (AC-03.4)", async () => {
    mocks.keysIpc.checkKey.mockResolvedValue({ status: "valid" });
    const { result } = renderHook(() => useProviderKeys());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.checkKey("gemini");
    });
    expect(result.current.results.gemini).toEqual({ type: "valid" });
  });

  it("reports 'invalid' when the check verdict is invalid (AC-03.4)", async () => {
    // The redacted, key-free reason is untrusted DATA; the verdict drives the
    // machine-readable outcome and never carries the provider string forward.
    mocks.keysIpc.checkKey.mockResolvedValue({
      status: "invalid",
      reason: "API key not valid ([REDACTED])",
    });
    const { result } = renderHook(() => useProviderKeys());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.checkKey("gemini");
    });
    expect(result.current.results.gemini).toEqual({ type: "invalid" });
  });

  it("maps a failed check to a typed error result (AC-03.4)", async () => {
    mocks.keysIpc.checkKey.mockRejectedValue({ kind: "network" });
    const { result } = renderHook(() => useProviderKeys());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.checkKey("gemini");
    });
    expect(result.current.results.gemini).toEqual({
      type: "error",
      kind: "network",
    });
  });
});
