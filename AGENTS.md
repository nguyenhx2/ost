# AGENTS.md - OST (guide for AI coding tools)

Mirrors CLAUDE.md for AI tools other than Claude Code (Codex, Cursor, Windsurf, ...). Keep
the two in sync.

Enforcement gap: Claude Code enforces guardrail layers 1-2 (settings.json permission gates,
hooks) automatically. Other tools lack those layers and must self-comply strictly with
`.claude/rules/guardrails.md` and the review gates (`/review-changes`, `/secret-scan`
equivalents): never read `.env*` except `.env.example`, never commit to `main`, Conventional
Commits with no AI attribution.

## The system

OST is a cross-platform desktop app (Windows first) that translates live system audio
(WASAPI loopback -> local whisper.cpp STT -> LLM) and user-selected screen regions
(capture -> OCR -> LLM with live preview) as low-latency overlays. Users bring their own
provider keys (Gemini, Anthropic, OpenAI, OpenRouter) stored in the OS keychain. Runs in the
background under strict performance budgets (audio p95 < 3s, region p95 < 2s, idle < 100MB
RAM / 1% CPU). Stack: Tauri 2 (Rust core) + React 19/TS/Vite. Full architecture, IPC contract,
provider contract: `docs/architecture.md`.

## Rules

Rules live in `.claude/rules/` - read `00-overview.md` first; precedence: `.claude/rules/` >
per-folder instructions > defaults. Only `00-overview.md` and `guardrails.md` load
unconditionally; `conventions.md` and `git.md` are path-scoped. Non-negotiables:
human-in-the-loop (AI output is a proposal, never an automatic action), the trait/IPC seams
stay real boundaries even though ownership is per-language now rather than per-context, keys
only in the OS keychain, captured content never persists or leaves the machine (text-only to
the chosen provider), primitives+tokens-only UI, no emoji, no em dash, no AI attribution in
commits/PRs.

## Documentation map

`docs/README.md` (orientation), `architecture.md` (system, module map, IPC + provider
contracts), `decisions.md` (append-only decision log, replaces the old per-file ADRs),
`known-issues.md` (environment/build findings), `backlog.md` (flat list of open work).
Everything under `.claude/` and the root instruction files is English.

## No orchestrator - roles as responsibilities, tool-agnostic

Plan and dispatch work directly; an earlier version routed everything through a dedicated
coordinator and the owner found that layer slowed work down more than it helped.

- **Rust ownership**: all of `src-tauri/src/` - capture, audio, local STT/OCR, LLM provider
  clients, the managed local-LLM engine, model downloads, key storage, the Tauri shell/IPC
  surface. The trait boundaries inside it are still load-bearing.
- **Frontend ownership**: all of `src/` + `e2e/`. Calls Rust only through the typed IPC
  wrapper.
- **Review gate** (read-only): coding standards, the design-system hard gate, and the
  security/privacy checklist together, one pass, before any PR.
- **Debug role** (read-only): a hang or crash needs a real thread dump before naming a
  cause - static code reading alone has produced a confidently wrong root cause here before.
- **Research role** (read-only on code, public docs only): every claim cited and dated, never
  sends project data externally.

Flow: implement (Rust or frontend role) -> tests -> the review gate -> secret scan -> open a
PR. Never release automatically - releases are gated and owner-only.

## Git

GitHub (`github.com/nguyenhx2/ost`), PRs, `gh` CLI. Never commit directly to `main`; one
branch per change (`feat/fix/chore/docs`). Conventional Commits (`.claude/rules/git.md`),
subject lowercase imperative <= 72 chars, NO AI attribution. Commit identity: **nguyenhx2**
`<nguyenhx1@gmail.com>` (repo-local config) - verify before every commit. Merging happens
through GitHub's normal review flow - no agent in this harness merges on its own.
