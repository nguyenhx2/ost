import { load, type Store } from "@tauri-apps/plugin-store";

/**
 * Persisted region-preview display layout (owner request 1): `stacked` is the
 * original source-over-translation layout, `columns` shows source and
 * translation side by side. Backed by tauri-plugin-store, same settings file
 * as the region language preferences - names only, never a secret.
 */

const STORE_FILE = "settings.json";
const REGION_LAYOUT_KEY = "regionPreviewLayout";

export type RegionPreviewLayout = "stacked" | "columns";

export const DEFAULT_REGION_PREVIEW_LAYOUT: RegionPreviewLayout = "stacked";

let storePromise: Promise<Store> | null = null;

function getStore(): Promise<Store> {
  if (storePromise === null) {
    storePromise = load(STORE_FILE);
  }
  return storePromise;
}

function coerce(raw: unknown): RegionPreviewLayout {
  return raw === "columns" ? "columns" : DEFAULT_REGION_PREVIEW_LAYOUT;
}

/** Load the persisted region-preview layout, or the default when absent. */
export async function loadRegionPreviewLayout(): Promise<RegionPreviewLayout> {
  const store = await getStore();
  const raw = await store.get<unknown>(REGION_LAYOUT_KEY);
  return coerce(raw);
}

/** Persist the region-preview layout choice. */
export async function saveRegionPreviewLayout(
  layout: RegionPreviewLayout,
): Promise<void> {
  const store = await getStore();
  await store.set(REGION_LAYOUT_KEY, layout);
  await store.save();
}
