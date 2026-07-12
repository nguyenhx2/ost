import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Dialog } from "./index";

describe("Dialog (modal primitive)", () => {
  it("renders nothing while closed", () => {
    render(
      <Dialog open={false} label="Consent" onClose={vi.fn()} closeLabel="Close">
        <p>body</p>
      </Dialog>,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("exposes an accessible modal surface and moves focus to it when open", () => {
    render(
      <Dialog open label="Consent" onClose={vi.fn()} closeLabel="Close">
        <p>body</p>
      </Dialog>,
    );
    const dialog = screen.getByRole("dialog", { name: "Consent" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveFocus();
  });

  it("requests close on Escape", () => {
    const onClose = vi.fn();
    render(
      <Dialog open label="Consent" onClose={onClose} closeLabel="Close">
        <p>body</p>
      </Dialog>,
    );
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("requests close on a backdrop click but not on a panel click", () => {
    const onClose = vi.fn();
    render(
      <Dialog open label="Consent" onClose={onClose} closeLabel="Close">
        <p>body</p>
      </Dialog>,
    );
    fireEvent.click(screen.getByText("body"));
    expect(onClose).not.toHaveBeenCalled();

    const backdrop = document.querySelector(".ost-dialog-backdrop");
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("exposes a visible close button that requests close without granting anything", () => {
    const onClose = vi.fn();
    render(
      <Dialog open label="Consent" onClose={onClose} closeLabel="Close">
        <p>body</p>
      </Dialog>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
