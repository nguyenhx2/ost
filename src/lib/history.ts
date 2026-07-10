import { load, type Store } from "@tauri-apps/plugin-store";

/**
 * Translation-history persistence (FR-04, BR-06, AC-04.4/04.5/04.6). Backed by
 * tauri-plugin-store (JSON on disk), driven entirely from the frontend through
 * this module - no scattered `invoke` calls, no Rust command needed.
 *
 * SECURITY (BR-06, security-privacy.md): this store is TEXT-ONLY. Every entry is
 * built here from an explicit, named field set (see `toEntry`) - API keys, audio
 * buffers and screenshots NEVER touch it, even if a caller passes extra fields.
 * Keys live solely in the OS keychain; captured audio/pixels never leave RAM.
 */

const STORE_FILE = "history.json";
const ENTRIES_KEY = "entries";
const ENABLED_KEY = "enabled";

/** BR-06: history records every completed translation by default. */
export const HISTORY_ENABLED_DEFAULT = true;

/** Upper bound on retained entries; the oldest are dropped past this cap. */
export const MAX_HISTORY_ENTRIES = 1000;

/** Session that produced a translation (HISTORY_ENTRY.session_type). */
export type SessionType = "audio" | "region";

const SESSION_TYPES: readonly SessionType[] = ["audio", "region"];

function isSessionType(value: unknown): value is SessionType {
  return (
    typeof value === "string" &&
    (SESSION_TYPES as readonly string[]).includes(value)
  );
}

/**
 * One persisted translation, mirroring the HISTORY_ENTRY data dictionary
 * (docs/specs/08-data-model.md). TEXT-ONLY by construction: there is no field
 * for a key, audio, or image - and `toEntry` copies only these named fields.
 */
export interface HistoryEntry {
  /** Stable record id (uuid). */
  id: string;
  /** `audio` or `region` (which pipeline produced it). */
  sessionType: SessionType;
  /** Recognized source text (STT/OCR) - plain text. */
  sourceText: string;
  /** Translated text - plain text. */
  translatedText: string;
  /** Source language (detected or pinned); empty when unknown. */
  sourceLanguage: string;
  /** Target language. */
  targetLanguage: string;
  /** Provider that actually produced the translation (after any fallback). */
  providerId: string;
  /** Model used. */
  modelId: string;
  /** ISO-8601 completion timestamp. */
  createdAt: string;
}

/**
 * Fields the recording seam supplies. Deliberately the exact HISTORY_ENTRY
 * content set MINUS the generated `id`/`createdAt` - so a caller cannot smuggle
 * an id/timestamp, and (with `toEntry`) cannot smuggle a key/audio/screenshot.
 */
export interface RecordInput {
  sessionType: SessionType;
  sourceText: string;
  translatedText: string;
  sourceLanguage: string;
  targetLanguage: string;
  providerId: string;
  modelId: string;
}

let storePromise: Promise<Store> | null = null;

function getStore(): Promise<Store> {
  if (storePromise === null) {
    storePromise = load(STORE_FILE);
  }
  return storePromise;
}

function newId(): string {
  const c: unknown = globalThis.crypto;
  if (
    typeof c === "object" &&
    c !== null &&
    typeof (c as Crypto).randomUUID === "function"
  ) {
    return (c as Crypto).randomUUID();
  }
  // Fallback for environments without crypto.randomUUID (never security-bearing).
  return `h-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * Build a persisted entry from ONLY the whitelisted, named fields. This is the
 * text-only gate: any extra property on `input` (a key, blob, etc.) is dropped
 * because it is never read here. `id` and `createdAt` are generated locally.
 */
function toEntry(input: RecordInput): HistoryEntry {
  return {
    id: newId(),
    sessionType: input.sessionType,
    sourceText: asString(input.sourceText),
    translatedText: asString(input.translatedText),
    sourceLanguage: asString(input.sourceLanguage),
    targetLanguage: asString(input.targetLanguage),
    providerId: asString(input.providerId),
    modelId: asString(input.modelId),
    createdAt: new Date().toISOString(),
  };
}

/** Coerce a raw persisted value into a valid entry, or null when unusable. */
function coerceEntry(raw: unknown): HistoryEntry | null {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }
  const record = raw as Record<string, unknown>;
  if (!isSessionType(record.sessionType)) {
    return null;
  }
  const id = asString(record.id);
  if (id === "") {
    return null;
  }
  return {
    id,
    sessionType: record.sessionType,
    sourceText: asString(record.sourceText),
    translatedText: asString(record.translatedText),
    sourceLanguage: asString(record.sourceLanguage),
    targetLanguage: asString(record.targetLanguage),
    providerId: asString(record.providerId),
    modelId: asString(record.modelId),
    createdAt: asString(record.createdAt),
  };
}

function coerceEntries(raw: unknown): HistoryEntry[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const entries: HistoryEntry[] = [];
  for (const item of raw) {
    const entry = coerceEntry(item);
    if (entry !== null) {
      entries.push(entry);
    }
  }
  return entries;
}

/** Whether history recording is on (BR-06: ON by default). */
export async function isHistoryEnabled(): Promise<boolean> {
  const store = await getStore();
  const raw = await store.get<unknown>(ENABLED_KEY);
  return typeof raw === "boolean" ? raw : HISTORY_ENABLED_DEFAULT;
}

/** Persist the enable/disable toggle (AC-04.6). */
export async function setHistoryEnabled(enabled: boolean): Promise<void> {
  const store = await getStore();
  await store.set(ENABLED_KEY, enabled);
  await store.save();
}

/** Load all persisted entries, newest first (dropping any corrupt rows). */
export async function loadHistory(): Promise<HistoryEntry[]> {
  const store = await getStore();
  const raw = await store.get<unknown>(ENTRIES_KEY);
  return coerceEntries(raw);
}

/**
 * Record a completed translation (AC-04.4). No-op when history is disabled
 * (AC-04.6). Returns the stored entry, or null when recording was skipped.
 * Newest entries are kept at the front; the store is capped to
 * `MAX_HISTORY_ENTRIES`.
 */
export async function recordTranslation(
  input: RecordInput,
): Promise<HistoryEntry | null> {
  if (!(await isHistoryEnabled())) {
    return null;
  }
  const entry = toEntry(input);
  const store = await getStore();
  const existing = coerceEntries(await store.get<unknown>(ENTRIES_KEY));
  const next = [entry, ...existing].slice(0, MAX_HISTORY_ENTRIES);
  await store.set(ENTRIES_KEY, next);
  await store.save();
  return entry;
}

/** Wipe the entire local history store (AC-04.5). Idempotent. */
export async function clearHistory(): Promise<void> {
  const store = await getStore();
  await store.set(ENTRIES_KEY, []);
  await store.save();
}
