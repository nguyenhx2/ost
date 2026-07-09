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
