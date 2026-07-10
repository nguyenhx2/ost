import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  modelIpc: {
    consentStatus: vi.fn(),
    grantConsent: vi.fn(),
    revokeConsent: vi.fn(),
  },
}));

vi.mock("../lib/ipc", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/ipc")>();
  return { ...actual, modelIpc: mocks.modelIpc };
});

import { OCR_MODEL_SET_ID, type ModelConsentStatus } from "../lib/ipc";
import { CONSENTABLE_MODEL_SET_IDS, useModelConsent } from "./useModelConsent";

function statusFor(modelSetId: string, granted: boolean): ModelConsentStatus {
  return {
    modelSetId,
    granted,
    disclosure: {
      modelSetId,
      displayName: "PP-OCRv5 recognition model",
      hostName: "ModelScope",
      hostDomain: "modelscope.cn",
      artifacts: [{ filename: "rec.onnx", approxSizeBytes: 16_000_000 }],
      totalApproxSizeBytes: 16_000_000,
      destination: "~/.oar",
    },
  };
}

beforeEach(() => {
  mocks.modelIpc.consentStatus
    .mockReset()
    .mockImplementation((id: string) => Promise.resolve(statusFor(id, true)));
  mocks.modelIpc.revokeConsent.mockReset().mockResolvedValue(undefined);
  mocks.modelIpc.grantConsent.mockReset().mockResolvedValue(undefined);
});

describe("useModelConsent", () => {
  it("loads consent status for every consentable model set on mount", async () => {
    const { result } = renderHook(() => useModelConsent());

    await waitFor(() => expect(result.current.loading).toBe(false));

    for (const id of CONSENTABLE_MODEL_SET_IDS) {
      expect(mocks.modelIpc.consentStatus).toHaveBeenCalledWith(id);
    }
    expect(result.current.statuses).toHaveLength(
      CONSENTABLE_MODEL_SET_IDS.length,
    );
    expect(result.current.statuses[0].granted).toBe(true);
  });

  it("revoke calls revoke_model_consent for the id and re-reads status", async () => {
    // After revoke the gate is closed again: the status flips to not-granted.
    mocks.modelIpc.consentStatus
      .mockResolvedValueOnce(statusFor(OCR_MODEL_SET_ID, true))
      .mockResolvedValue(statusFor(OCR_MODEL_SET_ID, false));

    const { result } = renderHook(() => useModelConsent());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.revoke(OCR_MODEL_SET_ID);
    });

    expect(mocks.modelIpc.revokeConsent).toHaveBeenCalledWith(OCR_MODEL_SET_ID);
    // The revoke carries only the model set id - no key/secret on the surface.
    expect(mocks.modelIpc.revokeConsent).toHaveBeenCalledWith(
      expect.not.stringContaining("key"),
    );
    await waitFor(() =>
      expect(
        result.current.statuses.find((s) => s.modelSetId === OCR_MODEL_SET_ID)
          ?.granted,
      ).toBe(false),
    );
    expect(result.current.revokeState[OCR_MODEL_SET_ID]).toBe("idle");
  });

  it("surfaces a revoke failure without throwing and keeps the entry", async () => {
    mocks.modelIpc.revokeConsent.mockRejectedValue(new Error("keychain"));

    const { result } = renderHook(() => useModelConsent());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.revoke(OCR_MODEL_SET_ID);
    });

    expect(result.current.revokeState[OCR_MODEL_SET_ID]).toBe("error");
    // Fail-closed preserved: consent status is unchanged on a failed revoke.
    expect(
      result.current.statuses.find((s) => s.modelSetId === OCR_MODEL_SET_ID)
        ?.granted,
    ).toBe(true);
  });
});
