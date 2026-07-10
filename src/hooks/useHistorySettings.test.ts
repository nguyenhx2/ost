import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  isHistoryEnabled: vi.fn(),
  setHistoryEnabled: vi.fn(),
}));

vi.mock("../lib/history", () => ({
  HISTORY_ENABLED_DEFAULT: true,
  isHistoryEnabled: mocks.isHistoryEnabled,
  setHistoryEnabled: mocks.setHistoryEnabled,
}));

import { useHistorySettings } from "./useHistorySettings";

beforeEach(() => {
  mocks.isHistoryEnabled.mockReset();
  mocks.isHistoryEnabled.mockResolvedValue(true);
  mocks.setHistoryEnabled.mockReset();
  mocks.setHistoryEnabled.mockResolvedValue(undefined);
});

describe("useHistorySettings", () => {
  it("loads the persisted enabled flag (ON by default)", async () => {
    const { result } = renderHook(() => useHistorySettings());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.enabled).toBe(true);
  });

  it("persists a disable toggle (AC-04.6)", async () => {
    const { result } = renderHook(() => useHistorySettings());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.setEnabled(false);
    });

    expect(mocks.setHistoryEnabled).toHaveBeenCalledWith(false);
    expect(result.current.enabled).toBe(false);
  });

  it("reverts and flags an error when persistence fails", async () => {
    mocks.setHistoryEnabled.mockRejectedValueOnce(new Error("store down"));
    const { result } = renderHook(() => useHistorySettings());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.setEnabled(false);
    });

    expect(result.current.enabled).toBe(true);
    expect(result.current.error).toBe(true);
  });
});
