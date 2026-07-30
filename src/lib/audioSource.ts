import { load, type Store } from "@tauri-apps/plugin-store";
import { type AudioSourceKind } from "./ipc";
import type { I18nKey } from "./i18n";

/**
 * Persisted audio-source preference (item 4, owner-reported: no way to pick
 * microphone vs system audio). Backed by tauri-plugin-store, the SAME
 * `settings.json` file and the SAME top-level key (`audioSource`) the Rust
 * core itself writes on `start_audio_session` (ipc.md) - so a choice made
 * here and a choice already persisted core-side always agree, with no second
 * source of truth.
 *
 * WHY this exists on the frontend at all: `start_audio_session` is the ONLY
 * place that persists this preference (there is no separate "set audio
 * source" command), and it is the caption-overlay window - not this Home
 * screen - that actually calls it. The overlay window is a fresh WebView
 * navigation that only receives provider/model/language NAMES via its URL
 * query (`shell/caption.rs` - Platform Shell context, out of Presentation
 * scope); it does not carry this preference across that boundary today. Home
 * writes the preference here; `useCaptionOverlay.startSession` (the ONLY
 * caller of `audioIpc.start`) reads it back and includes it explicitly in the
 * request whenever the query itself did not already carry one - so the
 * choice reaches the real session start without any Rust change.
 */

const STORE_FILE = "settings.json";
const AUDIO_SOURCE_KEY = "audioSource";

export const DEFAULT_AUDIO_SOURCE: AudioSourceKind = "systemLoopback";

export interface AudioSourceOption {
  value: AudioSourceKind;
  labelKey: I18nKey;
}

export const AUDIO_SOURCE_OPTIONS: AudioSourceOption[] = [
  { value: "systemLoopback", labelKey: "audioSource.systemLoopback" },
  { value: "microphone", labelKey: "audioSource.microphone" },
];

let storePromise: Promise<Store> | null = null;

function getStore(): Promise<Store> {
  if (storePromise === null) {
    storePromise = load(STORE_FILE);
  }
  return storePromise;
}

function coerce(raw: unknown): AudioSourceKind {
  return raw === "microphone" ? "microphone" : DEFAULT_AUDIO_SOURCE;
}

/** Load the persisted audio-source preference, or the default when absent. */
export async function loadAudioSourcePreference(): Promise<AudioSourceKind> {
  const store = await getStore();
  const raw = await store.get<unknown>(AUDIO_SOURCE_KEY);
  return coerce(raw);
}

/** Persist the audio-source preference (a name only, never a secret). */
export async function saveAudioSourcePreference(
  value: AudioSourceKind,
): Promise<void> {
  const store = await getStore();
  await store.set(AUDIO_SOURCE_KEY, value);
  await store.save();
}
