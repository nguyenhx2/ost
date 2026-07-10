import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Input } from "./Input";

describe("Input primitive", () => {
  it("renders a labelled field and reports typed text", async () => {
    const onChange = vi.fn();
    render(<Input label="API key" value="" onChange={onChange} />);

    const field = screen.getByLabelText("API key");
    await userEvent.type(field, "abc");

    // onChange fires per keystroke with the latest character.
    expect(onChange).toHaveBeenCalled();
    expect(onChange).toHaveBeenLastCalledWith("c");
  });

  it("masks the value when type is password", () => {
    render(
      <Input
        label="API key"
        value="secret"
        onChange={() => {}}
        type="password"
      />,
    );
    const field = screen.getByLabelText("API key");
    expect(field).toHaveAttribute("type", "password");
  });

  it("defaults to text type", () => {
    render(<Input label="Name" value="" onChange={() => {}} />);
    expect(screen.getByLabelText("Name")).toHaveAttribute("type", "text");
  });

  it("exposes an invalid state to assistive tech", () => {
    render(
      <Input
        label="API key"
        value="x"
        onChange={() => {}}
        invalid
        describedById="err-1"
      />,
    );
    const field = screen.getByLabelText("API key");
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field).toHaveAttribute("aria-describedby", "err-1");
  });

  it("does not autocomplete secret fields", () => {
    render(
      <Input label="API key" value="" onChange={() => {}} type="password" />,
    );
    expect(screen.getByLabelText("API key")).toHaveAttribute(
      "autocomplete",
      "off",
    );
  });
});
