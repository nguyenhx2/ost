# guard-main-commit.ps1
# Event: PreToolUse   Matcher: Bash
# Blocks `git commit` / `git push` while the EFFECTIVE branch is main or master.
# The effective branch is resolved from the command's actual target dir (a leading `cd <dir>` or
# `git -C <dir>`), falling back to the payload's `cwd`, so the hook does not misfire on git
# worktrees or on commands that operate on a sibling checkout.
#
# Contract: reads the PreToolUse JSON payload on stdin. exit 2 = BLOCK (message on stderr, shown
# to Claude); exit 0 = allow.

try {
    $raw = [Console]::In.ReadToEnd()
    if (-not $raw) { exit 0 }
    $payload = $raw | ConvertFrom-Json
} catch {
    exit 0
}

$cmd = $payload.tool_input.command
if (-not $cmd) { exit 0 }
# Detect `git commit` / `git push` INCLUDING forms that carry git's global options before the
# subcommand, above all `git -C <dir> commit`. The previous pattern required the subcommand to
# follow `git` immediately, so `git -C <repo-on-main> commit` exited here as "not a git commit"
# and sailed straight through - which also made the `git -C` target-dir resolution below dead
# code. The option loop only consumes tokens starting with `-` (optionally followed by one
# value), so `git log --grep=commit` still does not match.
$gitWrite = '(^|[;&|]\s*)git\s+(?:-\S+(?:\s+(?:"[^"]*"|''[^'']*''|[^-\s]\S*))?\s+)*(commit|push)\b'
if ($cmd -notmatch $gitWrite) { exit 0 }

$baseCwd = if ($payload.cwd) { $payload.cwd } else { (Get-Location).Path }
$targetDir = $baseCwd

# A leading `cd <dir>` wins over `git -C <dir>`: the cd happens first and git -C is relative to it
# only when git -C is itself relative, which the branch lookup below tolerates.
if ($cmd -match '(?:^|[;&|]\s*)cd\s+"([^"]+)"' -or
    $cmd -match "(?:^|[;&|]\s*)cd\s+'([^']+)'" -or
    $cmd -match '(?:^|[;&|]\s*)cd\s+([^\s;&|]+)') {
    if ($Matches[1]) { $targetDir = $Matches[1] }
} elseif ($cmd -match 'git\s+-C\s+"([^"]+)"' -or
          $cmd -match "git\s+-C\s+'([^']+)'" -or
          $cmd -match 'git\s+-C\s+([^\s]+)') {
    if ($Matches[1]) { $targetDir = $Matches[1] }
}

# MSYS / Git-Bash style absolute paths (`/d/Projects/...`) must be translated to Win32
# (`D:\Projects\...`) BEFORE the rooted check below. Windows reports IsPathRooted('/d/foo') as
# TRUE, so such a path skips the relative-path branch, and `git -C /d/foo` then resolves
# nothing - which used to fall through to the $baseCwd fallback and report a DIFFERENT
# checkout's branch. That failed both ways: it blocked legitimate worktree commits, and it
# could allow a commit to main when the payload cwd happened to sit on a feature branch.
if ($targetDir -match '^/([a-zA-Z])/(.*)$') {
    $targetDir = $Matches[1].ToUpper() + ':\' + ($Matches[2] -replace '/', '\')
} elseif ($targetDir -match '^/([a-zA-Z])/?$') {
    $targetDir = $Matches[1].ToUpper() + ':\'
}

# Relative target dirs resolve against the payload cwd, not the hook process's cwd.
$explicitTarget = $targetDir -ne $baseCwd
if (-not [System.IO.Path]::IsPathRooted($targetDir)) {
    try { $targetDir = [System.IO.Path]::GetFullPath((Join-Path $baseCwd $targetDir)) } catch { $targetDir = $baseCwd }
}

$branch = git -C $targetDir rev-parse --abbrev-ref HEAD 2>$null
if (-not $branch -and $explicitTarget) {
    # The command named a target dir we cannot resolve. Do NOT guess by falling back to a
    # different checkout - a guard hook must fail CLOSED, because the silent fallback is
    # exactly how a direct commit to main slips past this check.
    [Console]::Error.WriteLine("BLOCKED: could not resolve a git branch for the command's target directory '$targetDir'. This guard fails closed rather than reading a different checkout's branch. Use a Windows-style path (D:\path\to\repo) or run the command with the repo as the working directory.")
    exit 2
}
if (-not $branch) { $branch = git -C $baseCwd rev-parse --abbrev-ref HEAD 2>$null }
if (-not $branch) { exit 0 }   # not a git repo (or git missing): nothing to guard

if ($branch -eq 'main' -or $branch -eq 'master') {
    [Console]::Error.WriteLine("BLOCKED: effective branch is '$branch'. Per .claude/rules/git-workflow.md, do not commit/push directly to main. Create a branch: git checkout -b feat/<slug> and commit again.")
    exit 2
}
exit 0
