/*
 * Small formatting helpers (pure lib, no UI). Kept out of components so they
 * are unit-testable and reused across surfaces.
 */

const BYTES_PER_KB = 1024;
const BYTES_PER_MB = BYTES_PER_KB * 1024;

/**
 * Human-readable byte size for the model-download disclosure (e.g. "15.8 MB").
 * The unit is a universal symbol, not translatable prose; the surrounding
 * "approximately" wording comes from i18n. Non-finite/negative inputs render
 * as "0 B" rather than throwing.
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }
  if (bytes >= BYTES_PER_MB) {
    return `${(bytes / BYTES_PER_MB).toFixed(1)} MB`;
  }
  if (bytes >= BYTES_PER_KB) {
    return `${(bytes / BYTES_PER_KB).toFixed(1)} KB`;
  }
  return `${Math.round(bytes)} B`;
}
