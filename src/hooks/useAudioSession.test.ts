import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  consentStatus: vi.fn(),
  openOverlay: vi.fn(),
  closeOverlay: vi.fn(),
  stop: vi.fn(),
  listeners: new Map<string, (payload: unknown) => void>(),
}));

vi.mock("../lib/ipc", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/ipc")>();
  return {
    ...actual,
    audioIpc: { stop: mocks.stop },
    captionIpc: {
      openOverlay: mocks.openOverlay,
      closeOverlay: mocks.closeOverlay,
    },
    modelIpc: { consentStatus: mocks.consentStatus },
    listenIpc: (event: string, handler: (payload: unknown) => void) => {
      mocks.listeners.set(event, handler);
      return Promise.resolve(() => mocks.listeners.delete(event));
    },
  };
});

import { useAudioSession } from "./useAudioSession";

beforeEach(() => {
  mocks.listeners.clear();
  mocks.consentStatus.mockReset();
  mocks.consentStatus.mockResolvedValue({
    modelSetId: "whisper-ggml",
    granted: true,
    disclosure: {
      modelSetId: "whisper-ggml",
      displayName: "whisper",
      hostName: "HF",
      hostDomain: "hf.co",
      artifacts: [],
      totalApproxSizeBytes: 0,
      destination: "/models",
    },
  });
  mocks.openOverlay.mockReset().mockResolvedValue(undefined);
  mocks.closeOverlay.mockReset().mockResolvedValue(undefined);
  mocks.stop.mockReset().mockResolvedValue(undefined);
});

describe("useAudioSession audio:stopped sync (TASK-016 follow-up)", () => {
  it("resets running when the overlay emits audio:stopped", async () => {
    const { result } = renderHook(() => useAudioSession());
    await waitFor(() => expect(result.current.whisperLoading).toBe(false));

    act(() => result.current.start("gemini", "gemini-2.5-flash"));
    await waitFor(() => expect(result.current.running).toBe(true));

    // The caption overlay window was closed directly -> core emits audio:stopped.
    await act(async () => {
      mocks.listeners.get("audio:stopped")?.(undefined);
    });

    await waitFor(() => expect(result.current.running).toBe(false));
  });
});
