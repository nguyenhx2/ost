# Rule: Tech stack

The settled stack (ADR-001..ADR-003). Do not change the stack without a new ADR.

| Category | Technology |
|----------|------------|
| Desktop shell | Tauri 2 (Rust core + system WebView) |
| Core language | Rust (stable toolchain, edition 2021+) |
| Frontend | React 19 + TypeScript (strict) + Vite |
| Styling | CSS custom properties as design tokens (see design-system.md) |
| Icons | lucide-react (SVG only) |
| Audio capture | WASAPI loopback via `cpal`/`wasapi` (Windows first; abstraction trait for macOS ScreenCaptureKit / Linux PipeWire later) |
| Speech-to-text | whisper.cpp local via `whisper-rs` (ADR-002) |
| Screen capture | `xcap` (or Windows Graphics Capture via `windows` crate) behind a capture trait |
| OCR | OPEN DECISION - Windows.Media.Ocr vs Tesseract vs paddle (TASK-005 /brainstorm -> ADR) |
| LLM providers | Gemini, Anthropic (Claude), OpenAI, OpenRouter - one provider trait, one client module each |
| Key storage | OS keychain via `keyring` crate (ADR-003) - Windows Credential Manager |
| Settings storage | tauri-plugin-store (JSON, no secrets ever) |
| Test | cargo test, Vitest, WebdriverIO + tauri-driver (e2e) |
| CI | GitHub Actions (`.github/workflows/ci.yml`) |
| Distribution | Tauri bundler; auto-update via tauri-plugin-updater (signed, CI-only keys) |

## Conventions

- Centralized provider clients: ALL LLM calls go through `src-tauri/src/providers/` (one
  module per provider implementing the shared `TranslationProvider` trait). Never call a
  provider SDK/HTTP API from UI code, Tauri command handlers, or pipeline stages directly.
- Heavy work (capture, STT, OCR, LLM I/O) runs on dedicated Rust async tasks/threads, never
  on the main/UI thread; frontend receives results via Tauri events.
- Performance budgets (NFR, gate every pipeline merge): audio caption end-to-end p95 < 3s;
  region translate p95 < 2s after selection; idle (no active session) RAM < 100MB, CPU < 1%.
- Pin dependency versions; upgrades are deliberate commits logged in
  `docs/context/tool-changelog.md`.
- Whisper/OCR models are downloaded at first run into `models/` (gitignored), never
  committed.
