---
description: Run unit + e2e tests.
allowed-tools: Bash(cargo test:*), Bash(npm run test:*), Bash(npx vitest:*)
---

Run in order: `cargo test` (in `src-tauri/`), `npm run test` (Vitest), and the WebdriverIO
e2e suite when wired (`npm run test:e2e`). All providers/STT/OCR mocked - no real API
calls. Report failures with the owning agent for each per the orchestrator routing table.
