/*
 * PLACEHOLDER provider/model catalog for the region preview (AC-02.8).
 * The real list comes from the FR-03 provider layer via IPC once TASK-006
 * lands; until then the four spec'd providers are listed with representative
 * model ids so the Select primitive and re-translate flow are exercisable.
 */

export interface ProviderModelOption {
  /** Stable option id: `<provider>/<model>`. */
  id: string;
  provider: string;
  model: string;
}

export const PROVIDER_MODEL_OPTIONS: ProviderModelOption[] = [
  {
    id: "gemini/gemini-2.5-flash",
    provider: "gemini",
    model: "gemini-2.5-flash",
  },
  {
    id: "anthropic/claude-sonnet-4-5",
    provider: "anthropic",
    model: "claude-sonnet-4-5",
  },
  { id: "openai/gpt-5-mini", provider: "openai", model: "gpt-5-mini" },
  { id: "openrouter/auto", provider: "openrouter", model: "auto" },
];

export const DEFAULT_PROVIDER_OPTION: ProviderModelOption =
  PROVIDER_MODEL_OPTIONS[0];

export function providerOptionLabel(option: ProviderModelOption): string {
  return `${option.provider} / ${option.model}`;
}

/* ------------------------------------------------------------------ */
/* Provider catalog for Settings (FR-03, TASK-009)                     */
/* ------------------------------------------------------------------ */

/**
 * The four supported providers, in the canonical Settings order (AC-03.1).
 * These ids are the frozen serde strings the Rust provider layer uses
 * (`src-tauri/src/providers/types.rs`); they are NOT user-facing copy.
 */
export const PROVIDER_IDS = [
  "gemini",
  "anthropic",
  "openai",
  "openrouter",
] as const;

export type ProviderId = (typeof PROVIDER_IDS)[number];

export interface ProviderModelInfo {
  id: string;
  label: string;
}

export interface ProviderMeta {
  id: ProviderId;
  /** Brand name shown in Settings (not translated - proper noun). */
  displayName: string;
  /** Whether a live key-check client exists yet (only Gemini in MVP). */
  supportsValidation: boolean;
  /** Selectable models (opaque model ids + display labels). */
  models: ProviderModelInfo[];
}

/**
 * Static provider/model catalog. The model lists mirror the pinned lists in the
 * provider clients (`docs/architecture/api-contracts/providers.md`); the real
 * catalog will come from `list_models` over IPC in a later task.
 */
export const PROVIDER_META: Record<ProviderId, ProviderMeta> = {
  gemini: {
    id: "gemini",
    displayName: "Gemini",
    supportsValidation: true,
    models: [
      { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
      { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
      { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
    ],
  },
  anthropic: {
    id: "anthropic",
    displayName: "Anthropic (Claude)",
    supportsValidation: false,
    models: [
      { id: "claude-sonnet-4-5", label: "Claude Sonnet 4.5" },
      { id: "claude-opus-4-1", label: "Claude Opus 4.1" },
      { id: "claude-haiku-4-5", label: "Claude Haiku 4.5" },
    ],
  },
  openai: {
    id: "openai",
    displayName: "OpenAI",
    supportsValidation: false,
    models: [
      { id: "gpt-5-mini", label: "GPT-5 mini" },
      { id: "gpt-5", label: "GPT-5" },
      { id: "gpt-4.1-mini", label: "GPT-4.1 mini" },
    ],
  },
  openrouter: {
    id: "openrouter",
    displayName: "OpenRouter",
    supportsValidation: false,
    models: [
      { id: "auto", label: "Auto (OpenRouter routing)" },
      { id: "openai/gpt-5-mini", label: "GPT-5 mini" },
      { id: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash" },
    ],
  },
};

export const PROVIDER_META_LIST: ProviderMeta[] = PROVIDER_IDS.map(
  (id) => PROVIDER_META[id],
);

export function isProviderId(value: string): value is ProviderId {
  return (PROVIDER_IDS as readonly string[]).includes(value);
}
