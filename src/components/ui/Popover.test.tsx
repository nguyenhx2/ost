import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MoreHorizontal } from "lucide-react";
import { Button, Popover, Select, type SelectOption } from "./index";

const OPTIONS: SelectOption[] = [
  { value: "stacked", label: "Stacked" },
  { value: "columns", label: "Columns" },
];

function renderPopover(children = <Button>Chọn lại</Button>) {
  return render(
    <Popover label="Tuỳ chọn khác" icon={<MoreHorizontal aria-hidden="true" />}>
      {children}
    </Popover>,
  );
}

describe("Popover (compact overflow/disclosure surface)", () => {
  it("is closed by default and opens the panel on trigger click", async () => {
    renderPopover();
    const trigger = screen.getByRole("button", { name: "Tuỳ chọn khác" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("group", { name: "Tuỳ chọn khác" })).toBeNull();

    await userEvent.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    const panel = screen.getByRole("group", { name: "Tuỳ chọn khác" });
    expect(panel).toBeInTheDocument();
    expect(panel).toHaveTextContent("Chọn lại");
  });

  it("portals the panel to document.body instead of reflowing its parent", async () => {
    const { container } = renderPopover();
    await userEvent.click(
      screen.getByRole("button", { name: "Tuỳ chọn khác" }),
    );
    const panel = screen.getByRole("group", { name: "Tuỳ chọn khác" });
    expect(container.contains(panel)).toBe(false);
    expect(document.body.contains(panel)).toBe(true);
  });

  it("re-clicking the trigger closes the panel", async () => {
    renderPopover();
    const trigger = screen.getByRole("button", { name: "Tuỳ chọn khác" });
    await userEvent.click(trigger);
    expect(screen.getByRole("group")).toBeInTheDocument();

    await userEvent.click(trigger);
    expect(screen.queryByRole("group")).toBeNull();
  });

  it("closes on Escape, refocuses the trigger, and never bubbles to an ancestor handler", async () => {
    const onAncestorKeyDown = vi.fn();
    render(
      <div onKeyDown={onAncestorKeyDown}>
        <Popover
          label="Tuỳ chọn khác"
          icon={<MoreHorizontal aria-hidden="true" />}
        >
          <Button>Chọn lại</Button>
        </Popover>
      </div>,
    );
    const trigger = screen.getByRole("button", { name: "Tuỳ chọn khác" });
    await userEvent.click(trigger);
    const panel = screen.getByRole("group", { name: "Tuỳ chọn khác" });

    fireEvent.keyDown(panel, { key: "Escape" });

    expect(screen.queryByRole("group")).toBeNull();
    expect(trigger).toHaveFocus();
    // The overlay-root Esc-dismiss handler must NEVER also fire from this
    // same keypress (it would close the whole overlay behind the popover).
    expect(onAncestorKeyDown).not.toHaveBeenCalled();
  });

  it("closes on an outside click", async () => {
    render(
      <div>
        <Popover
          label="Tuỳ chọn khác"
          icon={<MoreHorizontal aria-hidden="true" />}
        >
          <Button>Chọn lại</Button>
        </Popover>
        <button type="button">Bên ngoài</button>
      </div>,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Tuỳ chọn khác" }),
    );
    expect(screen.getByRole("group")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Bên ngoài" }));

    expect(screen.queryByRole("group")).toBeNull();
  });

  it("stays open when picking an option from a nested Select (own portal, not a DOM descendant)", async () => {
    const onChange = vi.fn();
    renderPopover(
      <Select
        label="Bố cục"
        options={OPTIONS}
        value="stacked"
        onChange={onChange}
      />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Tuỳ chọn khác" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Bố cục" }));

    // The Select's listbox is ALSO portaled to document.body, as a sibling
    // of the popover panel - picking an option must not read as an "outside"
    // click and close the popover prematurely.
    await userEvent.click(screen.getByRole("option", { name: "Columns" }));

    expect(onChange).toHaveBeenCalledWith("columns");
    expect(
      screen.getByRole("group", { name: "Tuỳ chọn khác" }),
    ).toBeInTheDocument();
  });

  it("moves focus to the first focusable control inside the panel on open", async () => {
    renderPopover();
    await userEvent.click(
      screen.getByRole("button", { name: "Tuỳ chọn khác" }),
    );

    expect(screen.getByRole("button", { name: "Chọn lại" })).toHaveFocus();
  });
});
