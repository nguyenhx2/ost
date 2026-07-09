# Rule: Coding standards

## TypeScript (frontend, `src/`)

- `strict: true` in tsconfig; no `any` (use `unknown` + narrowing); no `@ts-ignore` without
  a comment stating why.
- Components are pure UI: business logic lives in hooks/`src/lib/`, IPC calls in a typed
  wrapper (`src/lib/ipc.ts`) - never `invoke()` scattered through components.
- Naming: `PascalCase` components, `camelCase` functions/vars, `SCREAMING_SNAKE_CASE`
  constants, `kebab-case` filenames except components.
- Lint/format gate before commit: `npm run lint` (eslint + prettier) must pass.

## Rust (core, `src-tauri/src/`)

- `cargo fmt` + `cargo clippy -- -D warnings` must pass before commit.
- Explicit error handling: `thiserror` for domain errors, `anyhow` only at the outermost
  command boundary; never `unwrap()`/`expect()` outside tests and provably-infallible cases
  (comment why).
- Module structure: one domain per module - `audio/`, `stt/`, `capture/`, `ocr/`,
  `providers/`, `keys/`, `shell/` (tray, hotkeys, windows), `commands/` (thin Tauri command
  handlers: validate input, call the domain module, map errors).
- Pipelines are trait-based: `AudioSource`, `SpeechToText`, `ScreenCapturer`, `OcrEngine`,
  `TranslationProvider` - platform- and provider-specific impls behind the trait, so the
  macOS/Linux ports (Phase 4) swap impls, not call sites.
- No blocking calls in async contexts; spawn blocking work with `tokio::task::spawn_blocking`.

## LLM usage (all agents and app code)

- All prompts through the centralized provider layer; structured output validated (serde
  schema) before use; instruction and data strictly separated in prompts; translated text is
  rendered as plain text (never interpreted as markup/commands).

## Documentation triggers

- Behavior-affecting logic change -> update `docs/context/business-rules.md`.
- Architectural decision -> `/new-adr`.
