# Rule: Git

## Identity and platform

- Platform: GitHub (`github.com/nguyenhx2/ost`). CLI: `gh` (authenticate with `gh auth login`).
- Commit identity (MANDATORY): **nguyenhx2** `<nguyenhx1@gmail.com>` - verify
  `git config user.name` / `git config user.email` before every commit. This repo carries a
  local config; the global config uses a different work identity - do not let it leak in.

## Branch and PR workflow

- Never commit directly to `main` (hook-enforced). One branch per change: `feat/<slug>`,
  `fix/<slug>`, `chore/<slug>`, `docs/<slug>`.
- Open a PR for review after `/review-changes` has run; the PR description carries what/why
  plus test evidence.
- Merging is a human decision - no agent in this harness merges. Land PRs through GitHub's
  normal review flow.
- CI: `.github/workflows/ci.yml` runs lint + unit + build on every PR (e2e when tauri-driver
  is wired). Secrets live in GitHub Actions secrets; never edit CI to skip checks; a red
  pipeline blocks merge.
- Releases only via the gated release flow (`.github/workflows/release.yml`,
  `workflow_dispatch` only) after explicit owner request; signing keys are CI-only secrets -
  see `docs/backlog.md` for the outstanding one-time owner setup steps.

## Conventional Commits (hook-enforced)

Format: `<type>(<scope>)?: <subject>` + optional body + optional footer
(`check-commit-msg.ps1`).

**Types**: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert.

**Scopes**: `audio` (WASAPI capture, VAD, chunking), `screen` (region/screen capture), `stt`
(speech-to-text), `ocr` (OCR), `llm` (provider layer, local managed engine, model routing),
`ui` (React frontend, overlay, settings), `platform` (tray, hotkeys, windows, IPC commands,
key storage, model downloads), `agents` (`.claude/` agents, rules, commands, hooks), `infra`
(CI, build, packaging, release), `docs` (documentation). Adding a genuinely new scope = add a
row here in the same PR.

**Subject rules**: imperative, English, lowercase start, no trailing period, max 72 chars.
Breaking change: `!` after type/scope + `BREAKING CHANGE:` footer.

## Attribution and style

NO AI attribution ever: no `Co-Authored-By: Claude`, no "Generated with Claude Code" - strip
them even when tooling adds them automatically. No emoji, no em dash (write "-").

## Enforcement

1. `check-commit-msg` hook blocks bad subjects at commit time.
2. `reviewer` checks the branch's commit list before a PR.
3. `/secret-scan` gates `/review-changes`.
