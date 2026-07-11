import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  keysIpc: { statuses: vi.fn() },
}));

vi.mock("../lib/ipc", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/ipc")>();
  return { ...actual, keysIpc: mocks.keysIpc };
});

import { useHasAnyProviderKey } from "./useHasAnyProviderKey";

function statusList(present: Partial<Record<string, boolean>>) {
  return [
    { provider_id: "gemini", key_present: !!present.gemini },
    { provider_id: "anthropic", key_present: !!present.anthropic },
    { provider_id: "openai", key_present: !!present.openai },
    { provider_id: "openrouter", key_present: !!present.openrouter },
  ];
}

beforeEach(() => {
  mocks.keysIpc.statuses.mockReset();
});

describe("useHasAnyProviderKey", () => {
  it("resolves to false when zero keys are configured (masked status only)", async () => {
    mocks.keysIpc.statuses.mockResolvedValue(statusList({}));
    const { result } = renderHook(() => useHasAnyProviderKey());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.hasKey).toBe(false);
  });

  it("resolves to true when at least one key is configured", async () => {
    mocks.keysIpc.statuses.mockResolvedValue(statusList({ openai: true }));
    const { result } = renderHook(() => useHasAnyProviderKey());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.hasKey).toBe(true);
  });

  it("stays optimistic (true) and does not throw while the check is in flight", () => {
    mocks.keysIpc.statuses.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useHasAnyProviderKey());

    expect(result.current.hasKey).toBe(true);
    expect(result.current.loading).toBe(true);
  });

  it("does not block on a rejected status check", async () => {
    mocks.keysIpc.statuses.mockRejectedValue(new Error("ipc failure"));
    const { result } = renderHook(() => useHasAnyProviderKey());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.hasKey).toBe(true);
  });

  it("refresh re-checks the masked statuses", async () => {
    mocks.keysIpc.statuses.mockResolvedValue(statusList({}));
    const { result } = renderHook(() => useHasAnyProviderKey());
    await waitFor(() => expect(result.current.loading).toBe(false));

    mocks.keysIpc.statuses.mockResolvedValue(statusList({ gemini: true }));
    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.hasKey).toBe(true);
  });
});
