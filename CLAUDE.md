# CLAUDE.md - OST (On-Screen Translator)

Cross-platform desktop app (Windows first) that translates live system audio (WASAPI
loopback -> local whisper.cpp -> LLM) and user-selected screen regions (capture -> OCR ->
LLM, live preview) as low-latency overlays; users bring their own provider keys (Gemini,
Anthropic, OpenAI, OpenRouter) stored in the OS keychain; runs in the background under
strict performance budgets. Features FR-01..FR-05 in
`docs/specs/05-functional-requirements.md`.

Stack: Tauri 2 (Rust core) + React 19/TS/Vite; whisper.cpp local STT; keyring key storage.
Details: `.claude/rules/tech-stack.md`.

## Mandatory rules

All system rules live in `.claude/rules/` - read `00-overview.md` first. Precedence on
conflict: `.claude/rules/` > per-folder CLAUDE.md > defaults.

Invariant principles:

1. **Human-in-the-loop**: AI translation output is a proposal; it never triggers actions.
2. **Follow the specs**: every feature maps to an FR and meets its acceptance criteria.
3. **Keys and captured content are the crown jewels**: keys only in the OS keychain; audio/
   screenshots never persist or leave the machine (text-only to the chosen provider) - see
   `.claude/rules/security-privacy.md`.
4. **Guardrails**: least privilege, untrusted-data defense, never read secrets, gated
   destructive actions - see `.claude/rules/agent-guardrails.md`.
5. **Performance is a requirement**: audio p95 < 3s, region p95 < 2s, idle < 100MB RAM /
   1% CPU gate pipeline merges.
6. **Frontend standards**: primitives + tokens only, dark-first, no emoji, lucide SVG
   icons - see `.claude/rules/frontend.md`, `design-system.md`.
7. **Writing style (everywhere)**: no emoji in any output; never the em dash - write "-";
   commits/PRs carry NO AI attribution. See `.claude/rules/conventional-commits.md`.

## Documentation map (docs/)

| Path | Role | When agents read it |
|------|------|---------------------|
| `docs/specs/` | 13-section BA specs - source of truth | ALWAYS, before feature work |
| `docs/requirements/` | PRD per feature (PRD-FR-NN) | When implementing that FR |
| `docs/architecture/system-overview.md` | High-level architecture | ALWAYS |
| `docs/architecture/decisions/` | ADRs - immutable once Accepted | Before technical decisions |
| `docs/architecture/api-contracts/` | IPC + provider contracts | When contracts change |
| `docs/tasks/` | master-plan + task files with AI session log | Start and end of every session |
| `docs/context/` | Long-term memory (glossary, business-rules, known-issues, tool-changelog) | When business context is needed |
| `docs/templates/` | TASK / PRD / ADR templates | When creating new files |

Documentation rules: no new doc structures outside these folders; new files from templates;
requirement changes logged in `docs/specs/13-revision-history.md`. Docs language:
Vietnamese (codes/enums English); everything under `.claude/` and the root instruction
files is English; task files and ADRs are 100% English.

## Task state (survives context compaction)

Task progress lives in markdown under `docs/tasks/` (committed) - see
`.claude/rules/task-tracking.md`. Agents MUST update the task file's session log after
every working session and MUST run `/task-resume TASK-NNN` before continuing any task in a
new or compacted session. The task files, not conversation memory, are the source of truth.

## Agents and orchestration

The `orchestrator` agent is the mission controller and default entry point for multi-step
work: it plans, decomposes into tasks, dispatches the specialists below, supervises results
against acceptance criteria, and records history in the task files.

| Agent | Scope |
|-------|-------|
| orchestrator | Mission control, routing, task lifecycle (writes no code) |
| audio-pipeline-dev | FR-01: `src-tauri/src/audio/`, `src-tauri/src/stt/` |
| screen-translate-dev | FR-02: `src-tauri/src/capture/`, `src-tauri/src/ocr/` |
| llm-integration-dev | FR-03 shared layer: `src-tauri/src/providers/`, `src-tauri/src/keys/` |
| frontend-ui-dev | FR-04 + all UI: `src/`, `src-tauri/src/shell/` |
| qa-test | Tests: cargo test, Vitest, WebdriverIO e2e |
| code-reviewer / security-reviewer / spec-guardian | Read-only review gates |
| debugger | Read-only root-cause analysis |
| ba-analyst | docs/specs + docs/requirements |
| devops | CI, packaging, gated releases |
| brainstormer + tech-researcher | Decisions -> ADRs |
| history-tracker | `.claude/state/history/` audit |

Standard feature flow: `spec-guardian` (FR check) -> specialist implements with TDD ->
`qa-test` -> `code-reviewer` + `security-reviewer` -> `/secret-scan` -> open PR. Command:
`/implement-fr FR-NN`.

## Common commands

`/implement-fr`, `/review-pr`, `/secret-scan`, `/new-task`, `/task-resume`, `/brainstorm`,
`/new-adr`, `/new-spec-section`, `/sync-context`, `/test`.

## Git

**GitHub** (remote pending - TASK-004), PRs, `gh` CLI, CI in
`.github/workflows/ci.yml`. See `.claude/rules/git-workflow.md`: never commit directly to
`main`, Conventional Commits (hook-enforced), commit identity is **nguyenhx2**
`<nguyenhx1@gmail.com>` (repo-local config) - verify `git config user.name`/`user.email`
before every commit.

## Hooks

`.claude/hooks/` (registered in `settings.json`) automatically: block edits to Accepted
ADRs, block commit/push directly to `main`, validate commit messages, block secret reads,
remind about revision history on spec changes, archive agent runs. See
`.claude/hooks/README.md`.

## AGENTS.md

`AGENTS.md` is the equivalent guide for other AI tools; the two files must stay in sync -
when you edit CLAUDE.md, update AGENTS.md accordingly.
