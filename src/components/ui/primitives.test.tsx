import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Pin } from "lucide-react";
import {
  Badge,
  Button,
  IconButton,
  OverlayPanel,
  Slider,
  Switch,
  Tooltip,
} from "./index";

describe("Button", () => {
  it("renders a type=button and fires onClick", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Dịch lại</Button>);
    const button = screen.getByRole("button", { name: "Dịch lại" });
    expect(button).toHaveAttribute("type", "button");
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe("IconButton", () => {
  it("always exposes an aria-label (WCAG icon-button rule)", () => {
    render(
      <IconButton label="Ghim overlay">
        <Pin aria-hidden="true" />
      </IconButton>,
    );
    expect(
      screen.getByRole("button", { name: "Ghim overlay" }),
    ).toBeInTheDocument();
  });

  it("exposes aria-pressed for toggle usage", () => {
    render(
      <IconButton label="Ghim overlay" pressed>
        <Pin aria-hidden="true" />
      </IconButton>,
    );
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "true");
  });
});

describe("Badge", () => {
  it("renders content and the warning variant class", () => {
    render(<Badge variant="warning">Độ tin cậy thấp</Badge>);
    const badge = screen.getByText("Độ tin cậy thấp");
    expect(badge).toHaveClass("ost-badge", "ost-badge--warning");
  });
});

describe("Tooltip", () => {
  it("links the trigger to a role=tooltip element via aria-describedby", () => {
    render(
      <Tooltip text="Chép bản dịch">
        <IconButton label="Chép bản dịch">
          <Pin aria-hidden="true" />
        </IconButton>
      </Tooltip>,
    );
    const trigger = screen.getByRole("button", { name: "Chép bản dịch" });
    const tooltip = screen.getByRole("tooltip");
    expect(tooltip).toHaveTextContent("Chép bản dịch");
    expect(trigger).toHaveAttribute("aria-describedby", tooltip.id);
  });
});

describe("Switch", () => {
  it("is a role=switch reflecting checked state and toggling on click", async () => {
    const onChange = vi.fn();
    render(<Switch checked={false} onChange={onChange} label="Tự cập nhật" />);
    const sw = screen.getByRole("switch", { name: /Tự cập nhật/ });
    expect(sw).toHaveAttribute("aria-checked", "false");
    await userEvent.click(sw);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("is keyboard operable (Enter/Space on the button)", async () => {
    const onChange = vi.fn();
    render(<Switch checked onChange={onChange} label="Tự cập nhật" />);
    screen.getByRole("switch").focus();
    await userEvent.keyboard("{Enter}");
    expect(onChange).toHaveBeenCalledWith(false);
  });
});

describe("Slider", () => {
  it("renders a labelled range input and reports numeric changes", () => {
    const onChange = vi.fn();
    render(
      <Slider
        label="Độ mờ nền"
        value={0.85}
        min={0.3}
        max={1}
        step={0.05}
        onChange={onChange}
      />,
    );
    const slider = screen.getByRole("slider", { name: "Độ mờ nền" });
    expect(slider).toHaveValue("0.85");
  });
});

describe("OverlayPanel", () => {
  it("is a labelled dialog surface", () => {
    render(<OverlayPanel label="Dịch vùng màn hình">nội dung</OverlayPanel>);
    const panel = screen.getByRole("dialog", { name: "Dịch vùng màn hình" });
    expect(panel).toHaveTextContent("nội dung");
  });

  it("feeds scrimOpacity into the --overlay-scrim-opacity token", () => {
    render(
      <OverlayPanel label="panel" scrimOpacity={0.5}>
        x
      </OverlayPanel>,
    );
    const panel = screen.getByRole("dialog", { name: "panel" });
    expect(panel.style.getPropertyValue("--overlay-scrim-opacity")).toBe("0.5");
  });
});
