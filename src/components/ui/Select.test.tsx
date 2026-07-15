import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Flag, Select, type SelectOption } from "./index";

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

  it("portals the open listbox to document.body instead of reflowing its parent (item 2)", async () => {
    const { container } = render(
      <Select
        label="Provider và model"
        options={OPTIONS}
        value={OPTIONS[0].value}
        onChange={vi.fn()}
      />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Provider và model" }),
    );
    const listbox = screen.getByRole("listbox", { name: "Provider và model" });
    // The listbox is NOT a descendant of the trigger's own render tree - it
    // is portaled straight onto <body>, so it can never push/reflow the
    // overlay panel that rendered the trigger.
    expect(container.contains(listbox)).toBe(false);
    expect(document.body.contains(listbox)).toBe(true);
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
    // The reason is a Tooltip (shown on hover/focus), not always in the DOM.
    await userEvent.hover(
      screen.getByRole("img", { name: "Requires a compatible CUDA GPU" }),
    );
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

  it("renders an option's flag icon beside its name (name stays primary, never flag-only)", async () => {
    const options: SelectOption[] = [
      { value: "en", label: "English", icon: <Flag country="GB" /> },
      { value: "vi", label: "Vietnamese", icon: <Flag country="VN" /> },
    ];
    render(
      <Select
        label="Source language"
        options={options}
        value="en"
        onChange={vi.fn()}
      />,
    );

    // Trigger: flag + language name, name is what carries the accessible name.
    const trigger = screen.getByRole("button", { name: "Source language" });
    expect(trigger).toHaveTextContent("English");
    expect(trigger.querySelector("img[aria-hidden='true']")).not.toBeNull();

    await userEvent.click(trigger);
    const option = screen.getByRole("option", { name: "Vietnamese" });
    // The flag is decorative (aria-hidden); the accessible name is pinned to
    // the label text alone via the option's own aria-label.
    expect(option).toHaveAttribute("aria-label", "Vietnamese");
    const flagImg = option.querySelector("img");
    expect(flagImg).not.toBeNull();
    expect(flagImg).toHaveAttribute("aria-hidden", "true");
    expect(flagImg).toHaveAttribute("alt", "");
    expect(option).toHaveTextContent("Vietnamese");
  });

  it("options without a flag render no icon (Auto-detect has none)", async () => {
    const options: SelectOption[] = [
      { value: "auto", label: "Auto-detect" },
      { value: "en", label: "English", icon: <Flag country="GB" /> },
    ];
    render(
      <Select
        label="Source language"
        options={options}
        value="auto"
        onChange={vi.fn()}
      />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Source language" }),
    );
    const autoOption = screen.getByRole("option", { name: "Auto-detect" });
    expect(autoOption.querySelector("img")).toBeNull();
  });
});
