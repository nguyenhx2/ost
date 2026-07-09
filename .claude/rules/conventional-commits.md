# Rule: Conventional commits

Format: `<type>(<scope>)?: <subject>` + optional body + optional footer. Hook-enforced
(`check-commit-msg.ps1`).

## Types

feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert.

## Project scopes

One per module/FR area. Adding a new scope = add it to this table in the same PR.

| Scope | Covers |
|-------|--------|
| audio | system-audio capture, VAD, chunking, STT pipeline (FR-01) |
| screen | region selection, screen capture, OCR pipeline (FR-02) |
| llm | provider layer, key management, model routing (FR-03) |
| ui | React frontend, overlay, tray, hotkeys, settings UI (FR-04) |
| core | shared Rust core, IPC contracts, config, performance (FR-05) |
| specs | docs/specs and docs/requirements changes |
| agents | .claude/ agents, rules, commands, hooks |
| infra | CI, build, packaging, release |
| docs | other documentation |

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
