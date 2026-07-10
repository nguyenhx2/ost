import { $, $$ } from "@wdio/globals";
import { gotoView } from "../support/nav.js";

/**
 * Critical flow (testing.md): settings / key-entry.
 *
 * Drives the REAL SettingsView against the release binary: the provider key
 * status comes from the REAL `provider_key_statuses` IPC command hitting the OS
 * keychain. Asserts the crown-jewel invariant (security-privacy.md): the key
 * field is masked and NO key value is ever present on the surface - only a
 * masked "configured / not configured" status.
 *
 * No screen capture is involved, so this flow is host-portable (runs anywhere
 * tauri-driver can launch the release binary).
 */
describe("settings key-entry surface", () => {
  before(async () => {
    await gotoView("settings");
  });

  it("renders provider rows with masked key inputs", async () => {
    // The key entry field is a password input (Input type="password"): masked
    // and autocomplete-disabled by the primitive. There must be at least one.
    const masked = await $$('input[type="password"]');
    await expect(masked.length).toBeGreaterThan(0);

    for (const field of masked) {
      await expect(field).toHaveAttribute("type", "password");
      // The field must start empty - no key value pre-filled onto the surface.
      await expect(field).toHaveValue("");
    }
  });

  it("shows a masked key status and never a raw key value", async () => {
    const bodyText = await $("body").getText();
    // The status is the masked disclosure only ("configured"/"not configured"
    // in the active locale) - assert the surface contains no key-shaped token.
    // Provider keys look like long opaque secrets; assert none leaked as text.
    const keyLikePatterns = [
      /sk-[A-Za-z0-9]{16,}/, // OpenAI / Anthropic style
      /AIza[A-Za-z0-9_-]{16,}/, // Google / Gemini style
      /sk-or-[A-Za-z0-9-]{16,}/, // OpenRouter style
    ];
    for (const pat of keyLikePatterns) {
      await expect(bodyText).not.toMatch(pat);
    }
    // A provider status region must exist (the view rendered, not a blank page).
    const statusRegions = await $$('[role="status"], .settings-provider');
    await expect(statusRegions.length).toBeGreaterThan(0);
  });
});
