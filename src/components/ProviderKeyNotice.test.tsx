import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mocks = vi.hoisted(() => ({
  settingsIpc: { open: vi.fn() },
}));

vi.mock("../lib/ipc", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/ipc")>();
  return { ...actual, settingsIpc: mocks.settingsIpc };
});

import { ProviderKeyNotice } from "./ProviderKeyNotice";

describe("ProviderKeyNotice (shared no-key affordance, TASK-025/TASK-028)", () => {
  it("renders the message and opens Settings on click", async () => {
    mocks.settingsIpc.open.mockReset().mockResolvedValue(undefined);
    render(
      <ProviderKeyNotice
        messageKey="home.noProviderKey"
        ctaKey="home.openSettings"
      />,
    );

    expect(
      screen.getByText(
        "No provider key is configured yet - open Settings to add one",
      ),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Open Settings" }),
    );
    expect(mocks.settingsIpc.open).toHaveBeenCalledTimes(1);
  });
});
