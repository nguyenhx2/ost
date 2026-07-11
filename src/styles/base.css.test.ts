import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * TASK-024 regression guard: the shared shell fill contract in base.css is
 * what keeps every window (transparent overlays AND opaque settings/history)
 * from showing WebView white bleed and window-level scrollbars on resize.
 * This is a text-level check (no jsdom stylesheet engine) so a future edit
 * cannot silently drop the html/body/#root rule without failing a test.
 */
describe("base.css shell fill contract", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const css = readFileSync(join(here, "base.css"), "utf-8");

  it("sizes html, body and #root to fill the window", () => {
    const shellRuleMatch = css.match(/html,\s*body,\s*#root\s*{([^}]*)}/);
    expect(shellRuleMatch).not.toBeNull();
    const rule = shellRuleMatch?.[1] ?? "";
    expect(rule).toMatch(/width:\s*100%/);
    expect(rule).toMatch(/height:\s*100%/);
    expect(rule).toMatch(/overflow:\s*hidden/);
    expect(rule).toMatch(/background-color:\s*transparent/);
  });
});
