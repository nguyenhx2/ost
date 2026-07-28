# Rule: Conventional commits

Format: `<type>(<scope>)?: <subject>` + optional body + optional footer. Hook-enforced
(`check-commit-msg.ps1`).

## Types

feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert.

## Project scopes

One per bounded context (see `.claude/rules/domain-model.md`) or cross-cutting area. Adding a new
scope = add it to this table in the same PR. Scopes below marked "historical" predate the
DDD reorganization and are kept valid so existing git history and muscle memory stay usable; new
commits in that area SHOULD prefer the context-named scope next to it.

| Scope | Covers | Context |
|-------|--------|---------|
| audio | System-audio device capture, VAD, chunking (`src-tauri/src/audio/`) | Capture |
| screen | Region/screen capture (`src-tauri/src/capture/`) - historical; OCR itself is `recognition` | Capture |
| recognition | OCR + STT engines (`src-tauri/src/ocr/`, `src-tauri/src/stt/`) | Recognition |
| llm | Provider layer, local managed engine, model routing (`src-tauri/src/providers/`, `src-tauri/src/llm/`) | Translation |
| ui | React frontend, overlay, settings UI (`src/`) | Presentation |
| platform | Tray, hotkeys, windows, IPC commands, key storage, model downloads (`src-tauri/src/shell/`, `commands/`, `keys/`, `models/`, `core/`) | Model Lifecycle + Platform Shell |
| core | Cross-cutting Rust concerns not otherwise covered - historical; prefer `platform` for `src-tauri/src/core/` | - |
| specs | docs/specs and docs/requirements changes | - |
| agents | .claude/ agents, rules, commands, hooks | - |
| infra | CI, build, packaging, release | - |
| docs | other documentation | - |

## Subject rules

- Imperative, English, lowercase start, no trailing period, max 72 chars.
- Breaking change: `!` after type/scope + `BREAKING CHANGE:` footer.
- Reference work items in the footer: `Refs: FR-01, TASK-003`.

## Attribution

NO AI attribution ever: no `Co-Authored-By: Claude`, no "Generated with Claude Code" - strip
them even when tooling adds them automatically. No emoji, no em dash.

## Enforcement

1. `check-commit-msg` hook blocks bad subjects at commit time.
2. `code-reviewer` checks the branch's commit list before a PR.
3. Optional commitlint CI job (add when the pipeline matures).
