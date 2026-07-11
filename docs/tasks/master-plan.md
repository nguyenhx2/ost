---
title: "Master plan - OST"
---

# Master plan

<!-- 100% English (see .claude/rules/task-tracking.md). Update the Status column on EVERY
task status change; it must always agree with the task file's frontmatter. -->

## Phases

| Phase | Goal | Status |
|-------|------|--------|
| 0 | Foundation: toolchain, app skeleton, CI green, full specs written | Done |
| 1 | Region-translate MVP (FR-02 + minimal FR-03/FR-04): select region -> OCR -> translate -> preview overlay, keys in keychain | Active |
| 2 | Live audio translation (FR-01): WASAPI loopback -> whisper.cpp -> translate -> caption overlay | Planned |
| 3 | Polish and performance (FR-04/FR-05 full): hotkeys, tray UX, history, latency/idle budgets enforced, auto-update, installer | Planned |
| 4 | Cross-platform: macOS (ScreenCaptureKit/Keychain) and Linux (PipeWire/Secret Service) backends behind the existing traits | Planned |

Rationale for Phase 1 before audio: the region pipeline exercises the whole architecture
(capture -> recognize -> provider layer -> overlay) with simpler realtime constraints,
delivering a usable product earliest; the audio pipeline then reuses the provider layer and
overlay system.

## Task index

| Task | Title | Owner | Deps | Priority | Phase | Status |
|------|-------|-------|------|----------|-------|--------|
| TASK-001 | Install Rust toolchain and verify build prerequisites | devops | - | P0 | 0 | Done |
| TASK-002 | Scaffold Tauri 2 + React 19 + Vite app skeleton | frontend-ui-dev | TASK-001 | P0 | 0 | Done |
| TASK-003 | Write full 13-section specs for FR-01..FR-05 (spec-builder) | ba-analyst | - | P0 | 0 | Done |
| TASK-004 | CI pipeline green on the skeleton (lint + cargo test + vitest + build) | devops | TASK-002 | P1 | 0 | Done |
| TASK-005 | Decide the OCR engine (/brainstorm -> ADR) | brainstormer | TASK-003 | P0 | 1 | Done |
| TASK-006 | Provider layer core: TranslationProvider trait, Gemini client, keyring storage | llm-integration-dev | TASK-002, TASK-003 | P0 | 1 | Done |
| TASK-007 | Region capture + OCR pipeline (Rust side) | screen-translate-dev | TASK-002, TASK-005 | P0 | 1 | Done |
| TASK-008 | Region-select overlay + translation preview UI | frontend-ui-dev | TASK-002 | P0 | 1 | Done |
| TASK-009 | Settings UI: provider key entry/validation, model selection | frontend-ui-dev | TASK-006 | P1 | 1 | Done |
| TASK-010 | Additional LLM provider clients: Anthropic, OpenAI, OpenRouter | llm-integration-dev | TASK-006 | P0 | 1 | Done |
| TASK-011 | Opt-in cloud OCR backends (BR-09) | screen-translate-dev | TASK-007 | P1 | 1 | Pending |
| TASK-012 | Settings revoke-consent control for model downloads | frontend-ui-dev | TASK-007, TASK-009 | P1 | 1 | Done |
| TASK-013 | System-audio capture: WASAPI loopback + VAD + chunking | audio-pipeline-dev | TASK-002 | P0 | 2 | Done |
| TASK-014 | Local STT: whisper.cpp + first-run download + hardware probe | audio-pipeline-dev | TASK-013, TASK-007 | P0 | 2 | Done |
| TASK-015 | Audio session pipeline wiring + audio p95 under 3s benchmark | audio-pipeline-dev | TASK-013, TASK-014 | P0 | 2 | Done |
| TASK-016 | Caption overlay UI (bilingual subtitles) | frontend-ui-dev | TASK-015, TASK-008 | P0 | 2 | Done |
| TASK-017 | Global hotkeys + tray UX | frontend-ui-dev | TASK-016 | P0 | 3 | Done |
| TASK-018 | Translation history (BR-06) | frontend-ui-dev | TASK-009 | P1 | 3 | Done |
| TASK-019 | Idle-budget enforcement + session-drop discipline | audio-pipeline-dev | TASK-007, TASK-015 | P0 | 3 | Done |
| TASK-020 | Auto-update + installer/bundler (gated release) | devops | TASK-004 | P1 | 3 | Done |
| TASK-021 | Fix region-capture WGC hang + first-run ordering + download timeout | screen-translate-dev | TASK-007 | P0 | 1 | Done |
| TASK-022 | Wire e2e acceptance gate (WebdriverIO + tauri-driver) | qa-test | TASK-021 | P0 | 1 | Done |
| TASK-023 | Fix reentrant window-lifecycle deadlock (close-select + open-preview) | frontend-ui-dev | TASK-021 | P0 | 1 | Done |
| TASK-024 | UI polish: transparent-window white-bleed, scrollbars, fill-on-resize sweep | frontend-ui-dev | TASK-023 | P1 | 3 | Done |
| TASK-025 | No-API-key onboarding notice on translation surfaces | frontend-ui-dev | TASK-009 | P1 | 3 | Active |
| TASK-026 | STT backend options (research + design + cloud-STT ADR package) | tech-researcher | TASK-014 | P1 | 2 | Active |
