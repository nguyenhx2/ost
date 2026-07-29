# Hooks - OST

Guardrail layer 2. PowerShell hooks (Windows dev machine; solo-Windows team per intake). Registered
in `.claude/settings.json`. If the team ever becomes mixed-OS, port these 1:1 to POSIX `.sh` (the
shipped `harness-bootstrap` skill carries an equivalent `.sh` flavor per hook) and update the
registration lines.

| Hook | Event | Matcher | Blocks / does |
|------|-------|---------|----------------|
| `protect-adr.ps1` | PreToolUse | `Edit\|Write` | Repointed (2026) from the old per-file ADRs to `docs/decisions.md`: enforces it as append-only whole-file - Edit is always blocked, Write is allowed only when the new content keeps the existing bytes as an exact prefix. Filename kept for the existing settings.json registration; content no longer has anything to do with ADR files. Resolves `file_path` against payload `cwd`. |
| `guard-main-commit.ps1` | PreToolUse | `Bash` | `git commit` / `git push` while the effective branch is `main` or `master`. Resolves the target dir from a leading `cd` / `git -C` so worktrees don't misfire. |
| `check-commit-msg.ps1` | PreToolUse | `Bash` | A `git commit -m` subject that violates `conventional-commits.md`: bad type, >72 chars, trailing period, uppercase description, or an AI-attribution trailer. Uses `-cmatch`/`-cnotmatch` (case-sensitive) - plain `-match` silently passes `Feat:`. |
| `protect-secrets.ps1` | PreToolUse | `Read\|Edit\|Write\|Bash` | Reads/edits of `.env*` (except `.env.example`), key/cert files, `secrets?/`+`credentials?/` dirs, service-account JSON, `.npmrc`/`.pypirc`/`.netrc`/`.aws/credentials`/`.ssh/`; shell commands that read/copy `.env`; destructive DB-reset commands (unused in this repo - no DB - kept as a harmless pattern). Matching is case-INSENSITIVE on purpose. |
| `specs-reminder.ps1` | PostToolUse | `Edit\|Write` | **DORMANT since the 2026 docs simplification**: `docs/specs/` and `docs/requirements/` no longer exist, so its path match never fires - it is registered but silently does nothing. Needs an owner-approved settings.json edit to deregister (see PR #86's rebase/follow-up notes for the exact diff); left in place rather than self-edited, since editing settings.json without being asked is out of scope for any agent. Original behavior, now unreachable: emitted `additionalContext` reminding to update `13-revision-history.md` and sync the PRD when `docs/specs/` changed. |
| `agent-history.ps1` | SubagentStop | `*` | Nothing blocking. Archives each finished subagent run (prompt + final response, read from the subagent's own transcript) to `.claude/state/history/` (gitignored). Always exits 0. |

## Contract

- Payload arrives as JSON on **stdin**. Signal by **exit code**: `2` = BLOCK, with the reason on
  **stderr** (that text is what Claude sees and acts on); `0` = allow. Any other code is ignored.
- Fast (< 1s), no network, plain-ASCII messages. Blocking hooks have no side effects.
- Fail **open**, never closed: an unparseable payload exits 0 - the `settings.json` deny rules and
  `.claude/rules/agent-guardrails.md` remain the backstop.

## Gotchas that bit us

- **`agent-history` is `SubagentStop`, not `PostToolUse`.** The subagent tool is `Agent` (there is
  no `Task` tool), and the `SubagentStop` payload carries **no** `tool_input`/`tool_response` - it
  has `agent_type`, `agent_id`, `agent_transcript_path`, `cwd`. A `PostToolUse` registration
  archives empty files (this repo ran that broken version until this harness rebuild - see
  `docs/context/tool-changelog.md`).
- **Resolve every path against the payload's `cwd`.** The hook process's own cwd is not the
  project's; a bare relative `.claude/state/history` writes to the wrong place.
- PowerShell `-match`/`-notmatch` are case-INSENSITIVE by default; `check-commit-msg.ps1` needs the
  opposite (`-cmatch`/`-cnotmatch`) for its lowercase-type check. Do not "simplify" that back.

## Testing

Pipe a sample payload in and assert the exit code - block case `2`, allow case `0`. Read
**`$LASTEXITCODE`**, never `$?` (`$?` is a boolean, so it never equals 2):

```powershell
'{"tool_input":{"file_path":".env"}}' | powershell -NoProfile -ExecutionPolicy Bypass -File .claude/hooks/protect-secrets.ps1; $LASTEXITCODE
```
