---
description: Create the skeleton of a feature module (entry point, library module, component, failing test).
argument-hint: <feature-slug>
---

Scaffold the feature **$1**. If $1 is empty, ask for the feature slug and stop.

Follow the layout in `.claude/rules/coding-standards.md`:

1. The entry point (route handler, controller, or command): input validation and delegation only.
   No business logic lives here.
2. The library module that holds the business logic, one directory per feature, testable without
   the transport layer.
3. The user-facing component, built from the existing design-system primitives rather than new
   one-off styles, when the feature has a user interface.
4. A failing cargo test + Vitest test that names the acceptance criterion of the FR it serves. It
   fails first; the implementation is what makes it pass.

Register the owner agent for the domain in the routing table if this feature is not covered by an
existing entry:

| Work | Agent |
|------|-------|
| Open decision - business or technical | `brainstormer` (+ `tech-researcher` for evidence) |
| Technology/library/provider research | `tech-researcher` |
| Domain model, context map, aggregate boundaries, ACL contracts (`docs/architecture/domain-model.md`) - consulted BEFORE any change crossing a context boundary | `domain-modeler` |
| Specs and requirements (`docs/specs/`, `docs/requirements/`) | `ba-analyst` |
| Recognition context - OCR + STT, Segment/Confidence/Fidelity (`src-tauri/src/ocr/`, `src-tauri/src/stt/`) | `recognition-dev` |
| Translation context - provider trait/clients, prompts, model routing (`src-tauri/src/providers/`, `src-tauri/src/llm/`) | `translation-dev` |
| Capture context - screen/region + audio device capture, VAD, chunking (`src-tauri/src/capture/`, `src-tauri/src/audio/`) | `capture-dev` |
| Presentation context - React overlay/settings UI (`src/`) | `presentation-dev` |
| Model Lifecycle + Platform Shell - downloads/consent, windows/tray/hotkeys, IPC commands, key storage, cross-pipeline shared kernel (`src-tauri/src/models/`, `src-tauri/src/shell/`, `src-tauri/src/commands/`, `src-tauri/src/keys/`, `src-tauri/src/core/`, `src-tauri/src/lib.rs`, `src-tauri/src/main.rs`) | `platform-dev` |
| Tests (cargo test / Vitest / WebdriverIO) | `qa-test` |
| Code review | `code-reviewer` |
| Security/privacy review | `security-reviewer` |
| Requirement-drift check | `spec-guardian` |
| Failure diagnosis | `debugger` |
| CI, packaging, gated release | `devops` |
| Merging approved PRs (delegated authority) | `merge-manager` (dispatched only by `orchestrator`) |
| Agent-run history audit (`.claude/state/history/`) | `history-tracker` |

Scaffolding creates structure, not behavior. Leave the logic unimplemented rather than filling it
with a plausible guess.
