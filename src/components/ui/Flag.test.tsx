import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { Flag } from "./Flag";

describe("Flag (self-hosted SVG, design-system.md flag-SVG exception)", () => {
  it("renders a self-hosted <img>, decorative and never emoji", () => {
    const { container } = render(<Flag country="VN" />);
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img).toHaveAttribute("aria-hidden", "true");
    expect(img).toHaveAttribute("alt", "");
    // No emoji regional-indicator glyphs anywhere in the rendered output.
    expect(container.textContent).toBe("");
  });

  it("is case-insensitive on the country code", () => {
    const { container } = render(<Flag country="vn" />);
    expect(container.querySelector("img")).not.toBeNull();
  });

  it("renders nothing for an unmapped country code (no broken image)", () => {
    const { container } = render(<Flag country="ZZ" />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.firstChild).toBeNull();
  });
});
