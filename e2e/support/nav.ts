import { browser } from "@wdio/globals";

/**
 * The release WebView serves the SAME embedded bundle for every window; the
 * rendered surface is chosen by the `?view=` query param (see src/main.tsx).
 * tauri-driver attaches to the main window, so we drive the individual views by
 * navigating that one WebView's URL rather than by opening the real satellite
 * windows (WebView2 WebDriver cannot switch to dynamically-created windows -
 * documented in the CI-vs-dev-host split). This still exercises the REAL
 * frontend + REAL IPC + REAL managed core state in one process.
 */
export async function gotoView(view: string): Promise<void> {
  const current = await browser.getUrl();
  const url = new URL(current);
  url.search = view ? `?view=${view}` : "";
  await browser.url(url.toString());
}

/** Read the origin the release WebView actually uses on this host. */
export async function origin(): Promise<string> {
  return browser.execute(() => window.location.origin);
}
