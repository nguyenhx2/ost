# Hooks - OST

PowerShell hooks (Windows dev machine; solo-Windows team per intake). Registered in
`.claude/settings.json`. If the team ever becomes mixed-OS, port these 1:1 to Node `.mjs`
(the project has a Node runtime) and update the registration lines.

| Hook | Event | Purpose |
|------|-------|---------|
| protect-adr.ps1 | PreToolUse Edit\|Write | Block edits to ADRs with `status: Accepted` (immutable; supersede with a new ADR) |
| guard-main-commit.ps1 | PreToolUse Bash | Block `git commit`/`git push` while the effective branch is `main`/`master` |
| check-commit-msg.ps1 | PreToolUse Bash | Validate `git commit -m` subject against conventional-commits.md |
| protect-secrets.ps1 | PreToolUse Read\|Edit\|Write\|Bash | Block access to `.env*` (except `.env.example`), key files, secrets dirs; block shell reads of `.env` |
| specs-reminder.ps1 | PostToolUse Edit\|Write | Remind to update revision history + PRD when `docs/specs/` changes (non-blocking) |
| agent-history.ps1 | PostToolUse Task\|Agent | Archive every subagent run to `.claude/state/history/` (non-blocking, gitignored) |

## Conventions

- Fast (under 1s), no network, no side effects beyond blocking/reminding.
- Exit 2 = block, with a plain-ASCII message on stderr. Exit 0 = allow.
- Blocking hooks never modify files; `agent-history` only appends to the gitignored archive.
- Test with a sample JSON payload, e.g.:
  `echo '{"tool_input":{"file_path":".env"}}' | powershell -NoProfile -ExecutionPolicy Bypass -File .claude/hooks/protect-secrets.ps1`
  (block case exits 2, allow case exits 0).
