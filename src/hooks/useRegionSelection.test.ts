import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

const regionIpcMock = vi.hoisted(() => ({
  startSelection: vi.fn().mockResolvedValue(undefined),
  cancelSelection: vi.fn().mockResolvedValue(undefined),
  confirmSelection: vi.fn().mockResolvedValue(undefined),
  previewReady: vi.fn().mockResolvedValue(undefined),
  requestTranslation: vi.fn().mockResolvedValue(undefined),
  setLiveUpdate: vi.fn().mockResolvedValue(undefined),
  closePreview: vi.fn().mockResolvedValue(undefined),
  nudgePreview: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/ipc", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/ipc")>();
  return { ...actual, regionIpc: regionIpcMock };
});

import { useRegionSelection } from "./useRegionSelection";

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(window, "devicePixelRatio", {
    value: 1,
    configurable: true,
  });
});

afterEach(() => {
  Object.defineProperty(window, "devicePixelRatio", {
    value: 1,
    configurable: true,
  });
});

describe("useRegionSelection - mouse path (AC-02.1)", () => {
  it("draws a rectangle while dragging and confirms on mouse release", () => {
    const { result } = renderHook(() => useRegionSelection());

    act(() => result.current.onMouseDown({ x: 10, y: 20 }));
    act(() => result.current.onMouseMove({ x: 110, y: 70 }));

    expect(result.current.selecting).toBe(true);
    expect(result.current.rect).toEqual({
      x: 10,
      y: 20,
      width: 100,
      height: 50,
    });

    act(() => result.current.onMouseUp());

    expect(regionIpcMock.confirmSelection).toHaveBeenCalledTimes(1);
    expect(regionIpcMock.confirmSelection).toHaveBeenCalledWith({
      x: 10,
      y: 20,
      width: 100,
      height: 50,
    });
  });

  it("normalizes a drag in any direction", () => {
    const { result } = renderHook(() => useRegionSelection());

    act(() => result.current.onMouseDown({ x: 200, y: 150 }));
    act(() => result.current.onMouseMove({ x: 50, y: 100 }));

    expect(result.current.rect).toEqual({
      x: 50,
      y: 100,
      width: 150,
      height: 50,
    });
  });

  it("converts CSS px to PHYSICAL px using devicePixelRatio", () => {
    Object.defineProperty(window, "devicePixelRatio", {
      value: 2,
      configurable: true,
    });
    const { result } = renderHook(() => useRegionSelection());

    act(() => result.current.onMouseDown({ x: 10, y: 20 }));
    act(() => result.current.onMouseMove({ x: 110, y: 70 }));

    expect(result.current.physicalRect).toEqual({
      x: 20,
      y: 40,
      width: 200,
      height: 100,
    });

    act(() => result.current.onMouseUp());
    expect(regionIpcMock.confirmSelection).toHaveBeenCalledWith({
      x: 20,
      y: 40,
      width: 200,
      height: 100,
    });
  });

  it("treats a click without a drag as a no-op (no confirm)", () => {
    const { result } = renderHook(() => useRegionSelection());

    act(() => result.current.onMouseDown({ x: 10, y: 10 }));
    act(() => result.current.onMouseUp());

    expect(regionIpcMock.confirmSelection).not.toHaveBeenCalled();
    expect(result.current.selecting).toBe(false);
  });
});

describe("useRegionSelection - Esc cancel (AC-02.1)", () => {
  it("cancels without emitting any capture/confirm call", () => {
    const { result } = renderHook(() => useRegionSelection());

    act(() => result.current.onMouseDown({ x: 10, y: 10 }));
    act(() => result.current.onKeyDown("Escape", false));

    expect(regionIpcMock.cancelSelection).toHaveBeenCalledTimes(1);
    expect(regionIpcMock.confirmSelection).not.toHaveBeenCalled();
  });

  it("does not confirm after a cancel (selection is finished)", () => {
    const { result } = renderHook(() => useRegionSelection());

    act(() => result.current.onKeyDown("Escape", false));
    act(() => result.current.onMouseDown({ x: 0, y: 0 }));
    act(() => result.current.onMouseMove({ x: 100, y: 100 }));
    act(() => result.current.onMouseUp());

    expect(regionIpcMock.confirmSelection).not.toHaveBeenCalled();
  });
});

describe("useRegionSelection - keyboard-only path (AC-02.1, WCAG)", () => {
  it("moves the cursor with arrows, anchors with Space, confirms with Enter", () => {
    const { result } = renderHook(() => useRegionSelection());

    // Move right 5 steps of 16px = x 80.
    for (let i = 0; i < 5; i += 1) {
      act(() => result.current.onKeyDown("ArrowRight", false));
    }
    act(() => result.current.onKeyDown("ArrowDown", false));
    expect(result.current.cursor).toEqual({ x: 80, y: 16 });

    act(() => result.current.onKeyDown(" ", false));
    expect(result.current.selecting).toBe(true);

    // Extend the rect 2 right + 2 down, then fine-step 1px with Shift.
    act(() => result.current.onKeyDown("ArrowRight", false));
    act(() => result.current.onKeyDown("ArrowRight", false));
    act(() => result.current.onKeyDown("ArrowDown", false));
    act(() => result.current.onKeyDown("ArrowDown", false));
    act(() => result.current.onKeyDown("ArrowDown", true));

    expect(result.current.rect).toEqual({
      x: 80,
      y: 16,
      width: 32,
      height: 33,
    });

    act(() => result.current.onKeyDown("Enter", false));

    expect(regionIpcMock.confirmSelection).toHaveBeenCalledWith({
      x: 80,
      y: 16,
      width: 32,
      height: 33,
    });
  });

  it("Enter without an anchored rect does not confirm", () => {
    const { result } = renderHook(() => useRegionSelection());

    act(() => result.current.onKeyDown("Enter", false));

    expect(regionIpcMock.confirmSelection).not.toHaveBeenCalled();
  });

  it("clamps the cursor to the viewport", () => {
    const { result } = renderHook(() => useRegionSelection());

    act(() => result.current.onKeyDown("ArrowLeft", false));
    act(() => result.current.onKeyDown("ArrowUp", false));

    expect(result.current.cursor).toEqual({ x: 0, y: 0 });
  });
});
