import { describe, expect, it } from "vitest";
import { hasAnyProviderKey } from "./providerKeys";

describe("hasAnyProviderKey", () => {
  it("is false when every provider status has key_present false", () => {
    expect(
      hasAnyProviderKey([
        { provider_id: "gemini", key_present: false },
        { provider_id: "anthropic", key_present: false },
        { provider_id: "openai", key_present: false },
        { provider_id: "openrouter", key_present: false },
      ]),
    ).toBe(false);
  });

  it("is true when at least one provider has a key configured", () => {
    expect(
      hasAnyProviderKey([
        { provider_id: "gemini", key_present: false },
        { provider_id: "anthropic", key_present: true },
      ]),
    ).toBe(true);
  });

  it("is false for an empty list", () => {
    expect(hasAnyProviderKey([])).toBe(false);
  });
});
