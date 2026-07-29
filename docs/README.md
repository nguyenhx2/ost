# OST docs

OST (On-Screen Translator) is a Windows-first desktop app (Tauri 2 + Rust core, React 19
frontend) that translates live system audio and user-selected screen regions using local
speech-to-text/OCR plus a user-supplied LLM provider key (Gemini, Anthropic, OpenAI,
OpenRouter, or a local OpenAI-compatible server). See the repo root `CLAUDE.md`/`AGENTS.md`
for the full project brief and the mandatory rules.

## Where things live

| File | Contents |
|------|----------|
| `docs/architecture.md` | System diagram, module map, data flow, performance budgets, the Tauri IPC contract, and the `TranslationProvider` contract. Keep this accurate when a command/event/provider changes - it is the only reference doc for the IPC surface. |
| `docs/decisions.md` | Append-only decision log (replaces per-file ADRs). Each entry: date, decision, why, status. Append new entries at the bottom; never edit a shipped entry, supersede it instead. |
| `docs/known-issues.md` | Environment and build findings that cost real time to rediscover (toolchain setup, known crashes, performance findings, workarounds). Check this before debugging anything that smells like an environment problem. |
| `docs/backlog.md` | Flat list of open work - parked decisions, known gaps, owner-reported issues. No task-file ceremony; just work an item and delete the row when it ships. |

## How to work in this repo

- There is no orchestrator agent. Plan and dispatch work directly in the main session -
  delegating through an extra coordination layer was found to slow things down more than it
  helped.
- Five agents cover everything: `rust-dev` (all of `src-tauri/src/`), `ui-dev` (`src/` +
  `e2e/`), `reviewer` (read-only code/security review gate), `debugger` (read-only root-cause
  diagnosis), `researcher` (read-only technology/public-docs research). See
  `.claude/agents/`.
- Rules live in `.claude/rules/`: `00-overview.md` and `guardrails.md` load always;
  `conventions.md` and `git.md` are path-scoped. Read `00-overview.md` first.
- Commands: `/secret-scan`, `/review-changes`, `/test`, `/task-resume`. See
  `.claude/commands/`.
- Standard flow for a change: implement with `rust-dev`/`ui-dev` -> `/test` ->
  dispatch `reviewer` -> `/secret-scan` -> open a PR (never commit to `main` directly).
