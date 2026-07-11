import type { ProviderKeyStatus } from "./ipc";

/**
 * Zero-key predicate (human-in-the-loop.md provider transparency): `true` when
 * at least one provider has a masked "key present" status. Every translation
 * surface funnels through this single function to decide whether to show the
 * distinct "configure a provider key" notice instead of attempting a doomed
 * translation call - keep it a simple function over the statuses list (no
 * hardcoded provider ids in components) so a future provider with different
 * "configured" semantics (e.g. a base_url-only provider with no key) only
 * needs a change here.
 */
export function hasAnyProviderKey(statuses: ProviderKeyStatus[]): boolean {
  return statuses.some((status) => status.key_present);
}
