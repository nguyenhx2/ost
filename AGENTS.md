# AGENTS.md - OST (guide for AI coding tools)

This file mirrors CLAUDE.md for AI tools other than Claude Code (Codex, Cursor, Windsurf,
...). The two files must stay in sync.

IMPORTANT - enforcement gap: Claude Code enforces guardrail layers 1-2 (settings.json
permission gates and hooks) automatically. Other tools DO NOT have those layers and must
strictly self-comply with the behavioral rules (`.claude/rules/agent-guardrails.md`,
`security-privacy.md`) and the review gates (`/review-pr`, `/secret-scan` equivalents):
never read `.env*` except `.env.example`, never commit to `main`, Conventional Commits
with no AI attribution, always update the task file session log.

## The system

OST is a cross-platform desktop app (Windows first) that translates live system audio
(WASAPI loopback -> local whisper.cpp STT -> LLM) and user-selected screen regions
(capture -> OCR -> LLM with live preview) as low-latency overlays. Users bring their own
provider keys (Gemini, Anthropic, OpenAI, OpenRouter) stored in the OS keychain. Runs in
the background under strict performance budgets (audio p95 < 3s, region p95 < 2s, idle
< 100MB RAM / 1% CPU). Stack: Tauri 2 (Rust core) + React 19/TS/Vite - see
`.claude/rules/tech-stack.md`.

## Rules

All rules live in `.claude/rules/` - read `00-overview.md` first; precedence:
`.claude/rules/` > per-folder instructions > defaults. Non-negotiables: human-in-the-loop
(AI output is a proposal), keys only in the OS keychain, captured content never persists
or leaves the machine (text-only to the chosen provider), primitives+tokens-only UI,
no emoji, no em dash, no AI attribution in commits/PRs.

## Documentation map

Same as CLAUDE.md: specs/ and requirements/ are the source of truth (ALWAYS read before
feature work); architecture/decisions/ ADRs are immutable once Accepted; docs/tasks/ holds
the master-plan and task files (100% English) with mandatory AI session logs;
docs/context/ is long-term memory. Docs prose is Vietnamese; `.claude/` and root
instruction files are English.

## Task state

Task progress lives in markdown under `docs/tasks/` (committed). Before continuing any
task in a new session: read `docs/tasks/master-plan.md` and the task file (equivalent of
`/task-resume`), verify the working tree with `git status`/`git diff`, then keep logging
session rows. The files, not conversation memory, are the source of truth.

## Roles (as responsibilities, tool-agnostic)

- Orchestration: plan, decompose into TASK files, route by module ownership, verify
  results against git state, record history.
- Module ownership: audio pipeline (`src-tauri/src/audio|stt`), screen translate
  (`src-tauri/src/capture|ocr`), LLM provider layer (`src-tauri/src/providers|keys`),
  UI (`src/`, `src-tauri/src/shell`). Do not cross scopes silently.
- Review gates before any PR: tests green (all providers/STT/OCR mocked), coding-standards
  + design-system check, security check (keys, captured content, prompt injection), secret
  scan, spec fidelity check.

Standard feature flow: requirement check -> TDD implementation by the owning role -> tests
-> code + security review -> secret scan -> PR. Never release automatically.

## Git

GitHub, PRs, `gh` CLI. Never commit directly to `main`; one branch per task
(`feat/fix/chore/docs`). Conventional Commits (types + scopes in
`.claude/rules/conventional-commits.md`), subject lowercase imperative <= 72 chars, NO AI
attribution. Commit identity: **nguyenhx2** `<nguyenhx1@gmail.com>` (repo-local config).

Merging is delegated to the `merge-manager` agent (owner authorization 2026-07-09) under
the gate in `.claude/rules/git-workflow.md`: CI green, no conflict, required reviews
passed, secret scan clean, and no rule file / hook / `settings.json` / Accepted ADR in the
diff. The agent that authored a change never merges it. Non-Claude tools lack the hook
layer and must self-comply strictly.
