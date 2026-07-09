import { invoke } from "@tauri-apps/api/core";

/**
 * Typed wrapper around the Tauri IPC bridge.
 *
 * ALL frontend -> core calls go through this function (coding-standards.md):
 * never import `invoke` directly in components or hooks. Command names and
 * payload/response types will be enumerated here as the IPC contract in
 * docs/architecture/api-contracts/ipc.md grows.
 */
export async function invokeIpc<T>(
  cmd: string,
  args?: Record<string, unknown>,
): Promise<T> {
  return invoke<T>(cmd, args);
}
