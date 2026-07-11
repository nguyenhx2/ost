import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Select, type SelectOption } from "./index";

const OPTIONS: SelectOption[] = [
  { value: "gemini/gemini-2.5-flash", label: "gemini / gemini-2.5-flash" },
  {
    value: "anthropic/claude-sonnet-4-5",
    label: "anthropic / claude-sonnet-4-5",
  },
  { value: "openai/gpt-5-mini", label: "openai / gpt-5-mini" },
];

function renderSelect(onChange = vi.fn()) {
  render(
    <Select
      label="Provider và model"
      options={OPTIONS}
      value={OPTIONS[0].value}
      onChange={onChange}
    />,
  );
  return onChange;
}

describe("Select (custom - design-system.md bans native <select>)", () => {
  it("never renders a native <select> element", () => {
    renderSelect();
    expect(document.querySelector("select")).toBeNull();
  });

  it("opens a listbox on click and selects an option with the mouse", async () => {
    const onChange = renderSelect();
    await userEvent.click(
      screen.getByRole("button", { name: "Provider và model" }),
    );
    const listbox = screen.getByRole("listbox", { name: "Provider và model" });
    expect(listbox).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("option", { name: "anthropic / claude-sonnet-4-5" }),
    );
    expect(onChange).toHaveBeenCalledWith("anthropic/claude-sonnet-4-5");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("supports the full keyboard path: ArrowDown opens, arrows navigate, Enter selects", async () => {
    const onChange = renderSelect();
    const trigger = screen.getByRole("button", { name: "Provider và model" });
    trigger.focus();
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    await userEvent.keyboard("{ArrowDown}{ArrowDown}{Enter}");
    expect(onChange).toHaveBeenCalledWith("openai/gpt-5-mini");
    // focus returns to the trigger after selection
    expect(trigger).toHaveFocus();
  });

  it("closes on Escape without selecting", async () => {
    const onChange = renderSelect();
    await userEvent.click(
      screen.getByRole("button", { name: "Provider và model" }),
    );
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("marks the current value with aria-selected", async () => {
    renderSelect();
    await userEvent.click(
      screen.getByRole("button", { name: "Provider và model" }),
    );
    expect(
      screen.getByRole("option", { name: "gemini / gemini-2.5-flash" }),
    ).toHaveAttribute("aria-selected", "true");
  });

  it("shows a disabled option with its reason via Tooltip and never selects it", async () => {
    const onChange = vi.fn();
    const options: SelectOption[] = [
      { value: "base", label: "Base" },
      {
        value: "large-v3",
        label: "Large v3",
        disabled: true,
        disabledReason: "Requires a compatible CUDA GPU",
      },
    ];
    render(
      <Select
        label="STT engine"
        options={options}
        value="base"
        onChange={onChange}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "STT engine" }));

    const disabledOption = screen.getByRole("option", { name: "Large v3" });
    expect(disabledOption).toHaveAttribute("aria-disabled", "true");
    expect(
      screen.getByText("Requires a compatible CUDA GPU"),
    ).toBeInTheDocument();

    await userEvent.click(disabledOption);
    expect(onChange).not.toHaveBeenCalled();
    // Clicking a disabled option does not close the listbox either.
    expect(screen.getByRole("listbox")).toBeInTheDocument();
  });

  it("keyboard navigation skips disabled options", async () => {
    const onChange = vi.fn();
    const options: SelectOption[] = [
      { value: "tiny", label: "Tiny" },
      {
        value: "small",
        label: "Small",
        disabled: true,
        disabledReason: "no RAM",
      },
      { value: "base", label: "Base" },
    ];
    render(
      <Select
        label="STT engine"
        options={options}
        value="tiny"
        onChange={onChange}
      />,
    );
    const trigger = screen.getByRole("button", { name: "STT engine" });
    trigger.focus();
    await userEvent.keyboard("{ArrowDown}");
    await userEvent.keyboard("{ArrowDown}{Enter}");
    expect(onChange).toHaveBeenCalledWith("base");
  });
});
