import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  sttIpc: {
    listModels: vi.fn(),
    requestSwitch: vi.fn(),
    confirmSwitch: vi.fn(),
    cancelDownload: vi.fn(),
    deleteModel: vi.fn(),
  },
  listenIpc: vi.fn(),
}));

vi.mock("../lib/ipc", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/ipc")>();
  return { ...actual, sttIpc: mocks.sttIpc, listenIpc: mocks.listenIpc };
});

import type { SttModelInfo } from "../lib/ipc";
import { useSttModels } from "./useSttModels";

function model(overrides: Partial<SttModelInfo> = {}): SttModelInfo {
  return {
    id: "base",
    label: "Base",
    approxDownloadBytes: 142_000_000,
    approxRamBytes: 388_000_000,
    downloaded: true,
    allowedByProbe: true,
    requiresCuda: false,
    current: true,
    ...overrides,
  };
}

beforeEach(() => {
  mocks.sttIpc.listModels.mockReset().mockResolvedValue([model()]);
  mocks.sttIpc.requestSwitch.mockReset();
  mocks.sttIpc.confirmSwitch.mockReset();
  mocks.sttIpc.cancelDownload.mockReset().mockResolvedValue(undefined);
  mocks.sttIpc.deleteModel.mockReset().mockResolvedValue(undefined);
  mocks.listenIpc.mockReset().mockResolvedValue(() => {});
});

describe("useSttModels", () => {
  it("loads the catalog on mount", async () => {
    const { result } = renderHook(() => useSttModels());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.models).toHaveLength(1);
    expect(mocks.sttIpc.listModels).toHaveBeenCalledTimes(1);
  });

  it("switches immediately when no download is needed", async () => {
    mocks.sttIpc.requestSwitch.mockResolvedValue({ status: "switched" });
    mocks.sttIpc.listModels
      .mockResolvedValueOnce([model({ id: "tiny", current: true })])
      .mockResolvedValue([
        model({ id: "tiny", current: false }),
        model({ id: "small", current: true }),
      ]);

    const { result } = renderHook(() => useSttModels());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.selectModel("small");
    });

    await waitFor(() =>
      expect(mocks.sttIpc.requestSwitch).toHaveBeenCalledWith("small"),
    );
    await waitFor(() =>
      expect(result.current.models.find((m) => m.id === "small")?.current).toBe(
        true,
      ),
    );
    expect(mocks.sttIpc.confirmSwitch).not.toHaveBeenCalled();
    expect(result.current.pendingConsent).toBeNull();
  });

  it("opens a pending consent instead of downloading when consent is required (BR-08)", async () => {
    mocks.sttIpc.requestSwitch.mockResolvedValue({
      status: "consentRequired",
      disclosure: {
        modelSetId: "whisper-ggml",
        displayName: "Whisper small",
        hostName: "Hugging Face",
        hostDomain: "huggingface.co",
        artifacts: [
          { filename: "ggml-small.bin", approxSizeBytes: 466_000_000 },
        ],
        totalApproxSizeBytes: 466_000_000,
        destination: "~/.cache/whisper",
      },
    });

    const { result } = renderHook(() => useSttModels());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.selectModel("small");
    });

    await waitFor(() =>
      expect(result.current.pendingConsent?.modelId).toBe("small"),
    );
    // Never downloads on its own.
    expect(mocks.sttIpc.confirmSwitch).not.toHaveBeenCalled();
  });

  it("confirmDownload calls confirm_stt_model_switch and clears the pending consent", async () => {
    mocks.sttIpc.requestSwitch.mockResolvedValue({
      status: "consentRequired",
      disclosure: {
        modelSetId: "whisper-ggml",
        displayName: "Whisper small",
        hostName: "Hugging Face",
        hostDomain: "huggingface.co",
        artifacts: [
          { filename: "ggml-small.bin", approxSizeBytes: 466_000_000 },
        ],
        totalApproxSizeBytes: 466_000_000,
        destination: "~/.cache/whisper",
      },
    });
    mocks.sttIpc.confirmSwitch.mockResolvedValue(undefined);

    const { result } = renderHook(() => useSttModels());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.selectModel("small");
    });
    await waitFor(() => expect(result.current.pendingConsent).not.toBeNull());

    act(() => {
      result.current.confirmDownload();
    });

    await waitFor(() =>
      expect(mocks.sttIpc.confirmSwitch).toHaveBeenCalledWith("small"),
    );
    await waitFor(() => expect(result.current.pendingConsent).toBeNull());
    // The download entry is cleared once the switch settles.
    await waitFor(() => expect(result.current.downloads.small).toBeUndefined());
  });

  it("cancelConsent clears the pending consent without downloading", async () => {
    mocks.sttIpc.requestSwitch.mockResolvedValue({
      status: "consentRequired",
      disclosure: {
        modelSetId: "whisper-ggml",
        displayName: "Whisper small",
        hostName: "Hugging Face",
        hostDomain: "huggingface.co",
        artifacts: [
          { filename: "ggml-small.bin", approxSizeBytes: 466_000_000 },
        ],
        totalApproxSizeBytes: 466_000_000,
        destination: "~/.cache/whisper",
      },
    });

    const { result } = renderHook(() => useSttModels());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.selectModel("small");
    });
    await waitFor(() => expect(result.current.pendingConsent).not.toBeNull());

    act(() => {
      result.current.cancelConsent();
    });

    expect(result.current.pendingConsent).toBeNull();
    expect(mocks.sttIpc.confirmSwitch).not.toHaveBeenCalled();
  });

  it("surfaces the sessionActive rejection without throwing", async () => {
    mocks.sttIpc.requestSwitch.mockRejectedValue({ kind: "sessionActive" });

    const { result } = renderHook(() => useSttModels());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.selectModel("small");
    });

    await waitFor(() => expect(result.current.error).toBe("sessionActive"));
    expect(result.current.pendingConsent).toBeNull();
  });

  it("tracks live download progress from stt:model-download-progress, keyed by model id", async () => {
    let handler: ((payload: unknown) => void) | null = null;
    mocks.listenIpc.mockImplementation(
      (_event: string, cb: (p: unknown) => void) => {
        handler = cb;
        return Promise.resolve(() => {});
      },
    );
    mocks.sttIpc.requestSwitch.mockResolvedValue({
      status: "consentRequired",
      disclosure: {
        modelSetId: "whisper-ggml",
        displayName: "Whisper small",
        hostName: "Hugging Face",
        hostDomain: "huggingface.co",
        artifacts: [
          { filename: "ggml-small.bin", approxSizeBytes: 466_000_000 },
        ],
        totalApproxSizeBytes: 466_000_000,
        destination: "~/.cache/whisper",
      },
    });
    mocks.sttIpc.confirmSwitch.mockImplementation(
      () => new Promise<void>(() => {}),
    );

    const { result } = renderHook(() => useSttModels());
    await waitFor(() => expect(handler).not.toBeNull());

    act(() => {
      result.current.selectModel("small");
    });
    await waitFor(() => expect(result.current.pendingConsent).not.toBeNull());
    act(() => {
      result.current.confirmDownload();
    });
    await waitFor(() => expect(result.current.downloads.small).toBeDefined());

    act(() => {
      handler?.({ modelId: "small", downloadedBytes: 100, totalBytes: 200 });
    });

    expect(result.current.downloads.small?.progress).toEqual({
      downloadedBytes: 100,
      totalBytes: 200,
    });
  });

  it("selecting a different model does not clear an unrelated in-flight download's progress (TASK-034)", async () => {
    let handler: ((payload: unknown) => void) | null = null;
    mocks.listenIpc.mockImplementation(
      (_event: string, cb: (p: unknown) => void) => {
        handler = cb;
        return Promise.resolve(() => {});
      },
    );
    mocks.sttIpc.requestSwitch.mockImplementation((modelId: string) =>
      Promise.resolve({
        status: "consentRequired",
        disclosure: {
          modelSetId: "whisper-ggml",
          displayName: `Whisper ${modelId}`,
          hostName: "Hugging Face",
          hostDomain: "huggingface.co",
          artifacts: [{ filename: `ggml-${modelId}.bin`, approxSizeBytes: 1 }],
          totalApproxSizeBytes: 1,
          destination: "~/.cache/whisper",
        },
      }),
    );
    // "small"'s download never resolves within this test.
    mocks.sttIpc.confirmSwitch.mockImplementation(
      () => new Promise<void>(() => {}),
    );

    const { result } = renderHook(() => useSttModels());
    await waitFor(() => expect(handler).not.toBeNull());

    act(() => {
      result.current.selectModel("small");
    });
    await waitFor(() => expect(result.current.pendingConsent).not.toBeNull());
    act(() => {
      result.current.confirmDownload();
    });
    await waitFor(() => expect(result.current.downloads.small).toBeDefined());

    act(() => {
      handler?.({ modelId: "small", downloadedBytes: 50, totalBytes: 100 });
    });
    expect(result.current.downloads.small?.progress?.downloadedBytes).toBe(50);

    // Now the dropdown picks a DIFFERENT tier while "small" keeps downloading.
    act(() => {
      result.current.selectModel("large-v3-turbo");
    });
    await waitFor(() =>
      expect(result.current.pendingConsent?.modelId).toBe("large-v3-turbo"),
    );

    // "small"'s progress entry is untouched.
    expect(result.current.downloads.small?.progress?.downloadedBytes).toBe(50);
  });

  it("cancelDownload requests cancellation and confirmDownload resolves with 'cancelled' without an error banner", async () => {
    mocks.sttIpc.requestSwitch.mockResolvedValue({
      status: "consentRequired",
      disclosure: {
        modelSetId: "whisper-ggml",
        displayName: "Whisper small",
        hostName: "Hugging Face",
        hostDomain: "huggingface.co",
        artifacts: [
          { filename: "ggml-small.bin", approxSizeBytes: 466_000_000 },
        ],
        totalApproxSizeBytes: 466_000_000,
        destination: "~/.cache/whisper",
      },
    });
    // Controlled so the test can call cancelDownload BEFORE the core "aborts"
    // (rejects with `cancelled`) - mirrors the real Rust round trip.
    let rejectConfirm: (err: unknown) => void = () => {};
    mocks.sttIpc.confirmSwitch.mockImplementation(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectConfirm = reject;
        }),
    );

    const { result } = renderHook(() => useSttModels());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.selectModel("small");
    });
    await waitFor(() => expect(result.current.pendingConsent).not.toBeNull());
    act(() => {
      result.current.confirmDownload();
    });
    await waitFor(() => expect(result.current.downloads.small).toBeDefined());

    act(() => {
      result.current.cancelDownload("small");
    });
    expect(mocks.sttIpc.cancelDownload).toHaveBeenCalledWith("small");
    expect(result.current.downloads.small?.cancelling).toBe(true);

    await act(async () => {
      rejectConfirm({ kind: "cancelled" });
    });

    await waitFor(() => expect(result.current.downloads.small).toBeUndefined());
    expect(result.current.error).toBeNull();
  });

  it("deleteModel calls delete_stt_model and refreshes the list", async () => {
    mocks.sttIpc.listModels
      .mockResolvedValueOnce([model({ id: "tiny", downloaded: true })])
      .mockResolvedValue([model({ id: "tiny", downloaded: false })]);

    const { result } = renderHook(() => useSttModels());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.deleteModel("tiny");
    });

    expect(mocks.sttIpc.deleteModel).toHaveBeenCalledWith("tiny");
    expect(result.current.models.find((m) => m.id === "tiny")?.downloaded).toBe(
      false,
    );
  });

  it("surfaces a delete failure without throwing", async () => {
    mocks.sttIpc.deleteModel.mockRejectedValue({ kind: "sessionActive" });

    const { result } = renderHook(() => useSttModels());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.deleteModel("base");
    });

    expect(result.current.deleteError).toBe("sessionActive");
  });
});
