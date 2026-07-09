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
});
