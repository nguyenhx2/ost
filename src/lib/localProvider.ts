/**
 * Client-side loopback validation for the local OpenAI-compatible provider's
 * `base_url` (FR-03.CUSTOM-1..5). Mirrors the Rust
 * `ProviderHttpConfig::is_loopback_only` check (`src-tauri/src/providers/
 * config.rs`) so a doomed translate request can be short-circuited BEFORE it
 * is ever sent (human-in-the-loop.md) - this is a best-effort, defense-in-
 * depth mirror only; the Rust side remains the actual enforcement point
 * (BR-01, NFR-SEC-03).
 */

/** An example loopback base_url shown in the actionable notice copy. */
export const LOCAL_BASE_URL_EXAMPLE = "http://127.0.0.1:1234";

function hostIsLoopback(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === "localhost") {
    return true;
  }
  if (host === "127.0.0.1" || host.startsWith("127.")) {
    return true;
  }
  return host === "::1" || host === "[::1]";
}

/**
 * `true` when `baseUrl` is non-empty, parses as a URL, carries no embedded
 * userinfo, uses `http`/`https`, and targets loopback (127.0.0.1 / localhost /
 * [::1]) - the exact set the local provider client accepts.
 */
export function isValidLocalBaseUrl(baseUrl: string): boolean {
  const trimmed = baseUrl.trim();
  if (trimmed === "") {
    return false;
  }
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return false;
  }
  if (url.username !== "" || url.password !== "") {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return false;
  }
  return hostIsLoopback(url.hostname);
}
