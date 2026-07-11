import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

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

import { useProviderPickerMetadata } from "./useProviderPickerMetadata";

beforeEach(() => {
  mocks.providersIpc.pickerMetadata.mockReset();
});

describe("useProviderPickerMetadata", () => {
  it("loads picker metadata including the local provider on mount", async () => {
    mocks.providersIpc.pickerMetadata.mockResolvedValue([
      {
        provider_id: "gemini",
        display_name: "Gemini",
        requires_base_url: false,
      },
      {
        provider_id: "local_openai",
        display_name: "Custom (local, OpenAI-compatible)",
        requires_base_url: true,
      },
    ]);

    const { result } = renderHook(() => useProviderPickerMetadata());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.metadata).toHaveLength(2);
    expect(
      result.current.metadata.find((m) => m.provider_id === "local_openai")
        ?.requires_base_url,
    ).toBe(true);
  });

  it("falls back to an empty list on failure without throwing", async () => {
    mocks.providersIpc.pickerMetadata.mockRejectedValue(new Error("ipc down"));

    const { result } = renderHook(() => useProviderPickerMetadata());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.metadata).toEqual([]);
  });
});
