import { describe, expect, it } from "vitest";
import {
  codeToKeyToken,
  eventToAccelerator,
  type AcceleratorKeyEvent,
} from "./accelerator";

function ev(over: Partial<AcceleratorKeyEvent>): AcceleratorKeyEvent {
  return {
    code: "KeyR",
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    metaKey: false,
    ...over,
  };
}

describe("codeToKeyToken", () => {
  it("maps letter and digit codes to bare tokens", () => {
    expect(codeToKeyToken("KeyR")).toBe("R");
    expect(codeToKeyToken("Digit1")).toBe("1");
  });

  it("passes through function, arrow, and named keys", () => {
    expect(codeToKeyToken("F5")).toBe("F5");
    expect(codeToKeyToken("ArrowUp")).toBe("ArrowUp");
    expect(codeToKeyToken("Space")).toBe("Space");
  });

  it("returns null for an unmappable code", () => {
    expect(codeToKeyToken("IntlBackslash")).toBeNull();
  });
});

describe("eventToAccelerator", () => {
  it("builds a canonical modifier+key accelerator", () => {
    expect(
      eventToAccelerator(ev({ code: "KeyR", ctrlKey: true, altKey: true })),
    ).toBe("Ctrl+Alt+R");
  });

  it("orders modifiers Ctrl, Alt, Shift, Super", () => {
    expect(
      eventToAccelerator(
        ev({
          code: "KeyO",
          ctrlKey: true,
          altKey: true,
          shiftKey: true,
          metaKey: true,
        }),
      ),
    ).toBe("Ctrl+Alt+Shift+Super+O");
  });

  it("rejects a combo with no strong modifier (Shift alone)", () => {
    expect(eventToAccelerator(ev({ code: "KeyR", shiftKey: true }))).toBeNull();
  });

  it("rejects a bare key with no modifier", () => {
    expect(eventToAccelerator(ev({ code: "KeyR" }))).toBeNull();
  });

  it("rejects a modifier-only press", () => {
    expect(
      eventToAccelerator(ev({ code: "ControlLeft", ctrlKey: true })),
    ).toBeNull();
  });

  it("rejects an unmappable main key even with a modifier", () => {
    expect(
      eventToAccelerator(ev({ code: "IntlBackslash", ctrlKey: true })),
    ).toBeNull();
  });

  it("accepts the Windows (Super) key as a strong modifier", () => {
    expect(eventToAccelerator(ev({ code: "KeyH", metaKey: true }))).toBe(
      "Super+H",
    );
  });
});
