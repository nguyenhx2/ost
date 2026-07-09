import { describe, expect, it } from "vitest";
import { resultMessage } from "./settingsMessages";

describe("resultMessage", () => {
  it("returns null for idle and busy states", () => {
    expect(resultMessage({ type: "idle" })).toBeNull();
    expect(resultMessage({ type: "busy" })).toBeNull();
  });

  it("maps success outcomes to an ok tone", () => {
    expect(resultMessage({ type: "saved" })).toEqual({
      key: "settings.result.saved",
      tone: "ok",
    });
    expect(resultMessage({ type: "storedUnvalidated" })).toEqual({
      key: "settings.result.storedUnvalidated",
      tone: "ok",
    });
    expect(resultMessage({ type: "valid" })).toEqual({
      key: "settings.result.valid",
      tone: "ok",
    });
  });

  it("maps invalid to a danger tone", () => {
    expect(resultMessage({ type: "invalid" })).toEqual({
      key: "settings.result.invalid",
      tone: "danger",
    });
  });

  it("maps each error kind to its i18n key with danger tone", () => {
    expect(resultMessage({ type: "error", kind: "network" })).toEqual({
      key: "settings.error.network",
      tone: "danger",
    });
    expect(resultMessage({ type: "error", kind: "quota" })).toEqual({
      key: "settings.error.quota",
      tone: "danger",
    });
    expect(resultMessage({ type: "error", kind: "keychain" })).toEqual({
      key: "settings.error.keychain",
      tone: "danger",
    });
  });
});
