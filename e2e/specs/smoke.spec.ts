import { browser, $ } from "@wdio/globals";

/**
 * Smoke: proves tauri-driver can launch the RELEASE binary and hand back a live
 * WebDriver session attached to the main WebView with working DOM access. This
 * is the gating capability for every other spec - if this cannot pass, e2e
 * cannot run on this host.
 */
describe("tauri-driver launch", () => {
  it("attaches to the main window and loads the embedded bundle", async () => {
    // WebView2 hands the session an initial about:blank before the app
    // navigates to its embedded tauri origin; poll until the real bundle mounts.
    await browser.waitUntil(
      async () => {
        const info = await browser.execute(() => ({
          origin: window.location.origin,
          href: window.location.href,
          hasRoot: !!document.getElementById("root"),
        }));
        return info.hasRoot && info.origin !== "null";
      },
      {
        timeout: 30_000,
        interval: 500,
        timeoutMsg: "app bundle never mounted",
      },
    );

    const info = await browser.execute(() => ({
      origin: window.location.origin,
      href: window.location.href,
      title: document.title,
      rootText: document.getElementById("root")?.textContent ?? "",
    }));
    console.log(`[smoke] ${JSON.stringify(info)}`);

    await expect(info.origin).not.toBe("null");
    const root = await $("#root");
    await expect(root).toExist();
    await expect(info.rootText).toContain("OST");
  });
});
