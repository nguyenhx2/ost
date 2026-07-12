import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  llmIpc: {
    listModels: vi.fn(),
    requestDownload: vi.fn(),
    confirmDownload: vi.fn(),
    cancelDownload: vi.fn(),
    deleteModel: vi.fn(),
  },
  listenIpc: vi.fn(),
}));

vi.mock("../lib/ipc", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/ipc")>();
  return { ...actual, llmIpc: mocks.llmIpc, listenIpc: mocks.listenIpc };
});

import type { LlmModelInfo } from "../lib/ipc";
import { useLlmModels } from "./useLlmModels";

function model(overrides: Partial<LlmModelInfo> = {}): LlmModelInfo {
  return {
    id: "hunyuan-mt-7b",
    label: "Hunyuan-MT-7B (Q4_K_M)",
    approxDownloadBytes: 4_624_950_272,
    approxRamBytes: 6_500_000_000,
    downloaded: false,
    isDefault: true,
    running: false,
    ...overrides,
  };
}

beforeEach(() => {
  mocks.llmIpc.listModels.mockReset().mockResolvedValue([model()]);
  mocks.llmIpc.requestDownload.mockReset();
  mocks.llmIpc.confirmDownload.mockReset();
  mocks.llmIpc.cancelDownload.mockReset().mockResolvedValue(undefined);
  mocks.llmIpc.deleteModel.mockReset().mockResolvedValue(undefined);
  mocks.listenIpc.mockReset().mockResolvedValue(() => {});
});

describe("useLlmModels", () => {
  it("loads the preset catalog on mount", async () => {
    const { result } = renderHook(() => useLlmModels());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.models).toHaveLength(1);
    expect(mocks.llmIpc.listModels).toHaveBeenCalledTimes(1);
  });

  it("applies immediately (no dialog) when the model is already downloaded", async () => {
    mocks.llmIpc.requestDownload.mockResolvedValue({
      status: "alreadyDownloaded",
    });
    const { result } = renderHook(() => useLlmModels());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.requestDownload("hunyuan-mt-7b");
    });

    await waitFor(() =>
      expect(mocks.llmIpc.requestDownload).toHaveBeenCalledWith(
        "hunyuan-mt-7b",
      ),
    );
    expect(result.current.pendingConsent).toBeNull();
    expect(mocks.llmIpc.confirmDownload).not.toHaveBeenCalled();
  });

  it("opens a pending consent instead of downloading when consent is required (human-in-the-loop.md)", async () => {
    mocks.llmIpc.requestDownload.mockResolvedValue({
      status: "consentRequired",
      disclosure: {
        modelSetId: "local-llm-gguf",
        displayName: "Local LLM translation model (llama-server)",
        hostName: "Hugging Face",
        hostDomain: "huggingface.co",
        artifacts: [
          {
            filename: "Hunyuan-MT-7B.Q4_K_M.gguf",
            approxSizeBytes: 4_624_950_272,
          },
        ],
        totalApproxSizeBytes: 4_624_950_272,
        destination: "~/.ost/llm",
      },
    });

    const { result } = renderHook(() => useLlmModels());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.requestDownload("hunyuan-mt-7b");
    });

    await waitFor(() =>
      expect(result.current.pendingConsent?.modelId).toBe("hunyuan-mt-7b"),
    );
    expect(mocks.llmIpc.confirmDownload).not.toHaveBeenCalled();
  });

  it("confirmDownload calls confirm_llm_model_download and clears the pending consent", async () => {
    mocks.llmIpc.requestDownload.mockResolvedValue({
      status: "consentRequired",
      disclosure: {
        modelSetId: "local-llm-gguf",
        displayName: "Local LLM translation model (llama-server)",
        hostName: "Hugging Face",
        hostDomain: "huggingface.co",
        artifacts: [
          { filename: "Qwen3-14B-Q4_K_M.gguf", approxSizeBytes: 9_001_752_960 },
        ],
        totalApproxSizeBytes: 9_001_752_960,
        destination: "~/.ost/llm",
      },
    });
    mocks.llmIpc.confirmDownload.mockResolvedValue(undefined);

    const { result } = renderHook(() => useLlmModels());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.requestDownload("qwen3-14b");
    });
    await waitFor(() => expect(result.current.pendingConsent).not.toBeNull());

    act(() => {
      result.current.confirmDownload();
    });

    await waitFor(() =>
      expect(mocks.llmIpc.confirmDownload).toHaveBeenCalledWith("qwen3-14b"),
    );
    await waitFor(() => expect(result.current.pendingConsent).toBeNull());
    await waitFor(() =>
      expect(result.current.downloads["qwen3-14b"]).toBeUndefined(),
    );
  });

  it("cancelConsent clears the pending consent without downloading", async () => {
    mocks.llmIpc.requestDownload.mockResolvedValue({
      status: "consentRequired",
      disclosure: {
        modelSetId: "local-llm-gguf",
        displayName: "Local LLM translation model (llama-server)",
        hostName: "Hugging Face",
        hostDomain: "huggingface.co",
        artifacts: [
          {
            filename: "Hunyuan-MT-7B.Q4_K_M.gguf",
            approxSizeBytes: 4_624_950_272,
          },
        ],
        totalApproxSizeBytes: 4_624_950_272,
        destination: "~/.ost/llm",
      },
    });

    const { result } = renderHook(() => useLlmModels());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.requestDownload("hunyuan-mt-7b");
    });
    await waitFor(() => expect(result.current.pendingConsent).not.toBeNull());

    act(() => {
      result.current.cancelConsent();
    });

    expect(result.current.pendingConsent).toBeNull();
    expect(mocks.llmIpc.confirmDownload).not.toHaveBeenCalled();
  });

  it("tracks live download progress keyed by model id", async () => {
    let handler: ((payload: unknown) => void) | null = null;
    mocks.listenIpc.mockImplementation(
      (_event: string, cb: (p: unknown) => void) => {
        handler = cb;
        return Promise.resolve(() => {});
      },
    );
    mocks.llmIpc.requestDownload.mockResolvedValue({
      status: "consentRequired",
      disclosure: {
        modelSetId: "local-llm-gguf",
        displayName: "Local LLM translation model (llama-server)",
        hostName: "Hugging Face",
        hostDomain: "huggingface.co",
        artifacts: [
          {
            filename: "Hunyuan-MT-7B.Q4_K_M.gguf",
            approxSizeBytes: 4_624_950_272,
          },
        ],
        totalApproxSizeBytes: 4_624_950_272,
        destination: "~/.ost/llm",
      },
    });
    mocks.llmIpc.confirmDownload.mockImplementation(
      () => new Promise<void>(() => {}),
    );

    const { result } = renderHook(() => useLlmModels());
    await waitFor(() => expect(handler).not.toBeNull());

    act(() => {
      result.current.requestDownload("hunyuan-mt-7b");
    });
    await waitFor(() => expect(result.current.pendingConsent).not.toBeNull());
    act(() => {
      result.current.confirmDownload();
    });
    await waitFor(() =>
      expect(result.current.downloads["hunyuan-mt-7b"]).toBeDefined(),
    );

    act(() => {
      handler?.({
        modelId: "hunyuan-mt-7b",
        downloadedBytes: 1_000_000_000,
        totalBytes: 4_624_950_272,
      });
    });

    expect(result.current.downloads["hunyuan-mt-7b"]?.progress).toEqual({
      downloadedBytes: 1_000_000_000,
      totalBytes: 4_624_950_272,
    });
  });

  it("cancelDownload requests cancellation and confirmDownload settling with 'cancelled' clears the entry without an error", async () => {
    mocks.llmIpc.requestDownload.mockResolvedValue({
      status: "consentRequired",
      disclosure: {
        modelSetId: "local-llm-gguf",
        displayName: "Local LLM translation model (llama-server)",
        hostName: "Hugging Face",
        hostDomain: "huggingface.co",
        artifacts: [
          {
            filename: "Hunyuan-MT-7B.Q4_K_M.gguf",
            approxSizeBytes: 4_624_950_272,
          },
        ],
        totalApproxSizeBytes: 4_624_950_272,
        destination: "~/.ost/llm",
      },
    });
    let rejectConfirm: (err: unknown) => void = () => {};
    mocks.llmIpc.confirmDownload.mockImplementation(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectConfirm = reject;
        }),
    );

    const { result } = renderHook(() => useLlmModels());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.requestDownload("hunyuan-mt-7b");
    });
    await waitFor(() => expect(result.current.pendingConsent).not.toBeNull());
    act(() => {
      result.current.confirmDownload();
    });
    await waitFor(() =>
      expect(result.current.downloads["hunyuan-mt-7b"]).toBeDefined(),
    );

    act(() => {
      result.current.cancelDownload("hunyuan-mt-7b");
    });
    expect(mocks.llmIpc.cancelDownload).toHaveBeenCalledWith("hunyuan-mt-7b");
    expect(result.current.downloads["hunyuan-mt-7b"]?.cancelling).toBe(true);

    await act(async () => {
      rejectConfirm({ kind: "cancelled" });
    });

    await waitFor(() =>
      expect(result.current.downloads["hunyuan-mt-7b"]).toBeUndefined(),
    );
    expect(result.current.error).toBeNull();
  });

  it("deleteModel calls delete_llm_model and refreshes the list", async () => {
    mocks.llmIpc.listModels
      .mockResolvedValueOnce([model({ downloaded: true })])
      .mockResolvedValue([model({ downloaded: false })]);

    const { result } = renderHook(() => useLlmModels());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.deleteModel("hunyuan-mt-7b");
    });

    expect(mocks.llmIpc.deleteModel).toHaveBeenCalledWith("hunyuan-mt-7b");
    expect(
      result.current.models.find((m) => m.id === "hunyuan-mt-7b")?.downloaded,
    ).toBe(false);
  });

  it("surfaces a delete failure (e.g. the server is running this model) without throwing", async () => {
    mocks.llmIpc.deleteModel.mockRejectedValue({ kind: "sessionActive" });

    const { result } = renderHook(() => useLlmModels());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.deleteModel("hunyuan-mt-7b");
    });

    expect(result.current.error).toBe("sessionActive");
  });
});
