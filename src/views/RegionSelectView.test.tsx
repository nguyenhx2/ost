import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

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

import { setLocale } from "../lib/i18n";
import { RegionSelectView } from "./RegionSelectView";

beforeEach(() => {
  vi.clearAllMocks();
  setLocale("en");
});

function renderView() {
  render(<RegionSelectView />);
  return screen.getByRole("application", {
    name: "Select a screen region to translate",
  });
}

describe("RegionSelectView (SCR-02, AC-02.1)", () => {
  it("shows the usage hints and focuses the overlay for keyboard use", () => {
    const overlay = renderView();
    expect(
      screen.getByText("Drag to select a region - release or Enter to confirm"),
    ).toBeInTheDocument();
    expect(overlay).toHaveFocus();
  });

  it("draws the rectangle and the size label while dragging", () => {
    const overlay = renderView();

    fireEvent.mouseDown(overlay, { clientX: 10, clientY: 20 });
    fireEvent.mouseMove(overlay, { clientX: 110, clientY: 70 });

    const rect = screen.getByTestId("selection-rect");
    expect(rect.style.left).toBe("10px");
    expect(rect.style.top).toBe("20px");
    expect(rect.style.width).toBe("100px");
    expect(rect.style.height).toBe("50px");

    // SCR-02: region dimensions are shown while dragging (physical px).
    expect(screen.getByText("100 x 50")).toBeInTheDocument();
  });

  it("confirms on mouse release with the selected coords", () => {
    const overlay = renderView();

    fireEvent.mouseDown(overlay, { clientX: 10, clientY: 20 });
    fireEvent.mouseMove(overlay, { clientX: 110, clientY: 70 });
    fireEvent.mouseUp(overlay);

    expect(regionIpcMock.confirmSelection).toHaveBeenCalledWith({
      x: 10,
      y: 20,
      width: 100,
      height: 50,
    });
  });

  it("Esc cancels without confirming (no capture event)", () => {
    const overlay = renderView();

    fireEvent.mouseDown(overlay, { clientX: 10, clientY: 20 });
    fireEvent.keyDown(overlay, { key: "Escape" });

    expect(regionIpcMock.cancelSelection).toHaveBeenCalledTimes(1);
    expect(regionIpcMock.confirmSelection).not.toHaveBeenCalled();
  });

  it("supports the keyboard-only selection path end to end", () => {
    const overlay = renderView();

    for (let i = 0; i < 4; i += 1) {
      fireEvent.keyDown(overlay, { key: "ArrowRight" });
    }
    fireEvent.keyDown(overlay, { key: "ArrowDown" });
    fireEvent.keyDown(overlay, { key: " " });
    fireEvent.keyDown(overlay, { key: "ArrowRight" });
    fireEvent.keyDown(overlay, { key: "ArrowDown" });
    fireEvent.keyDown(overlay, { key: "Enter" });

    expect(regionIpcMock.confirmSelection).toHaveBeenCalledWith({
      x: 64,
      y: 16,
      width: 16,
      height: 16,
    });
  });
});
