# Rule: Security and privacy

## What is sensitive here

1. **User AI provider keys** (Gemini, Anthropic, OpenAI, OpenRouter) - the highest-value
   secret. Stored ONLY in the OS keychain (Windows Credential Manager) via the `keyring`
   crate wrapper in `src-tauri/src/keys/`. Never in files, logs, settings store, crash
   reports, or IPC payloads (the WebView receives only provider name + masked status).
2. **Captured content** - system audio buffers, screenshots, OCR text, transcripts. Kept in
   memory for the active session only; never persisted to disk by default; never sent
   anywhere except the minimal TEXT payload to the user-chosen LLM provider. Audio never
   leaves the machine (STT is local, ADR-002).
3. **Dev/CI secrets** - `OST_TEST_*` keys in `.env.local` (gitignored, hook-blocked);
   release signing keys in GitHub Actions secrets only.

## Policies

- In transit: HTTPS/TLS to providers; the only other outbound flow is the user-confirmed
  whisper model download at first run (no user data leaves the machine). No telemetry
  without explicit opt-in (none in MVP).
- Translation history is ON by default (BR-06, user decision 2026-07-09): stores text
  only, locally, with a visible clear-all control and a disable toggle; keys and audio are
  never part of history.
- Input validation at every boundary: Tauri command handlers validate all IPC input;
  provider responses schema-validated.
- No tokens/keys/PII in logs at any level; log redaction is part of the provider layer.
- `.env.example` documents every dev/CI variable with placeholders; real env files are
  gitignored and hook-blocked from agent reads.
- Dependency risk: prefer well-maintained crates/packages; new native/audio/capture deps
  get a security-reviewer pass before merge.
