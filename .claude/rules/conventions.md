---
paths:
  - "src/**"
  - "src-tauri/**"
  - "e2e/**"
---

# Rule: Conventions

Coding standards, testing, and frontend/design-system rules for `rust-dev` and `ui-dev`.

## TypeScript (frontend, `src/`)

- `strict: true` in tsconfig; no `any` (use `unknown` + narrowing); no `@ts-ignore` without a
  comment stating why.
- Components are pure UI: business logic lives in hooks/`src/lib/`, IPC calls go through the
  typed wrapper `src/lib/ipc.ts` - never `invoke()`/`listen()` scattered through components.
- Naming: `PascalCase` components, `camelCase` functions/vars, `SCREAMING_SNAKE_CASE`
  constants, `kebab-case` filenames except components.
- Lint/format gate before commit: `npm run lint` (eslint + prettier) must pass.
- State: keep it minimal (React state + context); introduce a store library only with a
  `docs/decisions.md` entry.

## Rust (core, `src-tauri/src/`)

- `cargo fmt` + `cargo clippy -- -D warnings` must pass before commit.
- Explicit error handling: `thiserror` for domain errors, `anyhow` only at the outermost
  command boundary; never `unwrap()`/`expect()` outside tests and provably-infallible cases
  (comment why).
- Module layout stays purposeful even with one owning agent (`rust-dev`) - see the module map
  in `docs/architecture.md`: `audio/`, `capture/` (raw capture); `stt/`, `ocr/` (recognition);
  `providers/`, `llm/` (translation); `models/` (shared download/consent engine); `keys/`,
  `shell/` (tray, hotkeys, windows), `commands/` (thin Tauri handlers: validate input, call the
  owning module, map errors), `core/` (the narrow shared kernel - `HeavySessionCoordinator` +
  `ResourceProbe` - do not add a second one without recording why in `docs/decisions.md`).
- Pipelines stay trait-based: `AudioSource`, `SpeechToText`, `ScreenCapturer`, `OcrEngine`,
  `TranslationProvider` - platform/provider-specific impls behind the trait, so a future
  macOS/Linux port or a new provider swaps an impl, not every call site.
- No blocking calls in async contexts; spawn blocking work with `tokio::task::spawn_blocking`.

## The seams that still matter

Even with one agent owning all of `src-tauri/src/`, these boundaries are load-bearing, not
decorative - a change that reaches around them is a design regression whether or not it
compiles:

- Nothing outside `providers/` speaks HTTP (or the local llama-server loopback protocol) to
  an LLM.
- Nothing outside `keys/` touches the OS keychain.
- Captured audio/screenshots never cross the Tauri IPC boundary as bytes - only pixel
  coordinates and text ever do (`docs/architecture.md`).
- A `Segment` (STT/OCR output) always carries a `Confidence` and a `Fidelity`
  (`Full`/`Degraded{reason}`); it is never silently upgraded to look certain.
- A `TranslationProposal` never wraps an unvalidated provider response.

## LLM usage (all agents and app code)

All prompts go through the centralized provider layer (`src-tauri/src/providers/`);
structured output is validated (serde schema) before use; instruction and data are strictly
separated in prompts; translated text renders as plain text, never interpreted as markup or
commands.

## Testing

Tests are mandatory and map to two things: the invariants of the code they sit in (see "the
seams that still matter" above) and the behavior a user actually depends on. Business logic
and pipeline stages are written test-first where that is the fastest way to pin an invariant
down; presentation glue and generated code are not test-first-theater targets.

| Layer | Framework | Scope |
|-------|-----------|-------|
| Unit (Rust) | `cargo test` | pipeline stages, provider clients (mocked HTTP), key storage wrapper (mocked keyring), chunking/VAD logic |
| Unit (TS) | Vitest | hooks, lib modules, IPC wrapper (mocked invoke) |
| Integration | `cargo test` + wiremock | provider trait impls against recorded/mocked HTTP; STT against tiny fixture audio |
| E2E | WebdriverIO + tauri-driver | critical flows: settings/key entry, region select -> preview, overlay lifecycle |

Non-negotiables:

- Mock EVERY external provider - no real API calls in tests. Opt-in live smoke tests exist
  behind an explicit env flag (`OST_TEST_*`) and never run in CI by default.
- Fixture audio/images are synthetic or self-recorded; never real user content.
- Coverage threshold for domain-logic modules: >= 80%.
- Performance budgets are acceptance criteria, not a separate concern: a latency benchmark
  (criterion) guards the STT chunk path and the region pipeline; a regression beyond budget
  fails review exactly like a failed functional test.
- Every trait acting as an anti-corruption seam (`TranslationProvider`, `OcrEngine`,
  `SpeechToText`, `ScreenCapturer`, `AudioSource`) gets a test against the trait's CONTRACT
  (a mock/fake exercised the same way a real implementation would be), not just against one
  concrete implementation.
- Run `/test` before opening a PR; red CI blocks merge.

## Frontend and design system (HARD GATE)

Build UI ONLY from primitives in `src/components/ui/` and design tokens in
`src/styles/tokens.css`. `reviewer` BLOCKS any diff that violates this contract.

- **Icons**: no emoji anywhere in the UI - SVG icons only, via `lucide-react`, with one
  written exception below.
- **Copy**: Vietnamese and English via i18n keys (`src/lib/i18n/`) from day one; no hardcoded
  user-facing strings in components; Vietnamese strings fully accented.
- **Theme**: dark-first; light theme through the same tokens; never hardcode colors - tokens
  only. Overlay windows need a token-defined scrim/contrast layer and user-adjustable opacity
  to stay legible over arbitrary backgrounds.
- **Accessibility**: target WCAG 2.1 AA - contrast >= 4.5:1 for text, full keyboard
  operability (overlay dismiss/pin/copy without a mouse), visible focus states, aria-labels on
  icon buttons, reduced-motion respected.
- **AI-output UI**: every translation renders as a proposal - source + translated text,
  provider/model badge, a copy control, an easy correction/re-translate affordance.
  Low-confidence STT segments and `Degraded` OCR fidelity get a visible flag, not a silent
  best guess.
- **Tokens**: CSS custom properties - color scales (dark-first), spacing scale, radii,
  typography, z-index layers (overlay > toast > modal), opacity steps for overlay scrims. No
  hardcoded hex/px values in components; no inline styles bypassing tokens.

### Landed primitives (`src/components/ui/`)

| Primitive | Purpose |
|-----------|---------|
| `Button` | Text button (default/primary variants) |
| `IconButton` | Icon-only button with mandatory `aria-label`; `pressed` for toggles |
| `Input` | Text/password field (only text-entry element); `password` masks + disables autocomplete for key entry |
| `Select` | Custom listbox select (native `<select>` banned); full keyboard nav |
| `Switch` | `role="switch"` toggle, keyboard operable |
| `Slider` | Token-styled range input (opacity control) |
| `Badge` | Status badge (provider/model, low-confidence warning) |
| `Tooltip` | Hover/focus tooltip linked via `aria-describedby` (raw `title=` banned) |
| `Dialog` | Modal surface (role="dialog", aria-modal, Esc/backdrop close, focus-on-open) |
| `OverlayPanel` | Translation overlay surface with user-adjustable scrim opacity |
| `PlainText` | Sanitizing plain-text renderer for untrusted OCR/transcript/translation output |
| `ProgressBar` | Determinate progress bar (model-download progress) |
| `Spinner` | Indeterminate loading indicator (streaming-translation-in-flight) |
| `Tabs` | Keyboard-accessible tab group (`role="tablist"`/`tab`/`tabpanel`, arrow-key nav) |
| `Textarea` | Multi-line paste/edit text field (region-preview pasteable source text) |
| `Flag` | Secondary, decorative country-flag visual next to a language name in `Select` options - see the flag-SVG exception below |
| `Popover` | Compact overflow/disclosure surface (portaled, viewport-clamped) |
| `Disclosure` | Progressive-disclosure toggle (`aria-expanded`/`aria-controls`) for secondary/advanced content |

Each new primitive: create it, export from the barrel, test it, and add a row here in the
same PR.

### Flag-SVG exception (owner-approved)

Language pickers show a country flag as a SECONDARY visual next to the language name (which
stays the primary label and the accessible name - never flag-only). This is a narrow, written
exception to the lucide-only icon policy:

- Self-hosted SVG only, under `src/assets/flags/` (one file per ISO 3166-1 alpha-2 country
  code); see the README there for source/license provenance.
- No emoji flags, ever. No CDN/external host, no runtime fetch, no npm dependency that pulls
  flag assets at build/run time - files are copied in-repo.
- Rendered via the `Flag` primitive (`aria-hidden`, decorative) and passed as the `icon` on a
  `Select` option; the option's `aria-label` stays pinned to the language name alone.

### Banned outright

- Native `<select>`, raw data `<table>`.
- Hardcoded colors/spacing, inline style token bypasses.
- Raw `title=` attributes (use `Tooltip`).
- Emoji as icons.
- `dangerouslySetInnerHTML` or markdown-interpreting provider output - translated/transcribed
  text renders through the sanitizing plain-text renderer, always.
