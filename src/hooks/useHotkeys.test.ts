import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { HotkeyConfig } from "../lib/ipc";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
}));

vi.mock("../lib/ipc", () => ({
  hotkeysIpc: { get: mocks.get, set: mocks.set },
  // Real-shaped narrowing so a rejected `set` surfaces a typed error.
  asHotkeyCommandError: (err: unknown) => {
    if (
      typeof err === "object" &&
      err !== null &&
      "kind" in err &&
      typeof (err as { kind: unknown }).kind === "string"
    ) {
      const e = err as { kind: string; action?: unknown };
      return {
        kind: e.kind,
        action: typeof e.action === "string" ? e.action : null,
      };
    }
    return { kind: "store", action: null };
  },
}));

import { useHotkeys } from "./useHotkeys";

const DEFAULT_CONFIG: HotkeyConfig = {
  toggleAudio: "Ctrl+Alt+A",
  regionSelect: "Ctrl+Alt+R",
  toggleOverlay: "Ctrl+Alt+O",
};

function pressKey(init: KeyboardEventInit): void {
  window.dispatchEvent(new KeyboardEvent("keydown", init));
}

beforeEach(() => {
  mocks.get.mockReset();
  mocks.get.mockResolvedValue({ ...DEFAULT_CONFIG });
  mocks.set.mockReset();
});

describe("useHotkeys", () => {
  it("loads the effective config on mount", async () => {
    const { result } = renderHook(() => useHotkeys());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.config).toEqual(DEFAULT_CONFIG);
  });

  it("records a new chord and submits the updated binding (AC-04.1)", async () => {
    const applied: HotkeyConfig = {
      ...DEFAULT_CONFIG,
      regionSelect: "Ctrl+Alt+G",
    };
    mocks.set.mockResolvedValue(applied);

    const { result } = renderHook(() => useHotkeys());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.startRecording("regionSelect"));
    expect(result.current.recording).toBe("regionSelect");

    await act(async () => {
      pressKey({ code: "KeyG", ctrlKey: true, altKey: true });
    });

    expect(mocks.set).toHaveBeenCalledWith({
      ...DEFAULT_CONFIG,
      regionSelect: "Ctrl+Alt+G",
    });
    await waitFor(() => expect(result.current.config).toEqual(applied));
    expect(result.current.recording).toBeNull();
  });

  it("ignores an incomplete chord and keeps recording", async () => {
    const { result } = renderHook(() => useHotkeys());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.startRecording("toggleAudio"));
    await act(async () => {
      // No strong modifier -> not a valid global shortcut.
      pressKey({ code: "KeyG", shiftKey: true });
    });

    expect(mocks.set).not.toHaveBeenCalled();
    expect(result.current.recording).toBe("toggleAudio");
  });

  it("surfaces a conflict error and leaves the config unchanged", async () => {
    mocks.set.mockRejectedValue({ kind: "conflict", action: "toggleOverlay" });

    const { result } = renderHook(() => useHotkeys());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.startRecording("toggleOverlay"));
    await act(async () => {
      pressKey({ code: "KeyO", ctrlKey: true, shiftKey: true });
    });

    await waitFor(() => expect(result.current.error?.kind).toBe("conflict"));
    expect(result.current.error?.action).toBe("toggleOverlay");
    expect(result.current.config).toEqual(DEFAULT_CONFIG);
  });

  it("cancels recording on Escape without rebinding", async () => {
    const { result } = renderHook(() => useHotkeys());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.startRecording("regionSelect"));
    await act(async () => {
      pressKey({ key: "Escape", code: "Escape" });
    });

    expect(result.current.recording).toBeNull();
    expect(mocks.set).not.toHaveBeenCalled();
  });
});
