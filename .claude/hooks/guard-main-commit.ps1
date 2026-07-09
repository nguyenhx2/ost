# guard-main-commit.ps1 - PreToolUse (Bash)
# Blocks git commit/push while the EFFECTIVE branch is main/master.
$payload = [Console]::In.ReadToEnd() | ConvertFrom-Json
$cmd = $payload.tool_input.command
if (-not $cmd) { exit 0 }
if ($cmd -notmatch '(^|[;&|]\s*)git\s+(commit|push)\b') { exit 0 }
$baseCwd = if ($payload.cwd) { $payload.cwd } else { (Get-Location).Path }
$targetDir = $baseCwd
if ($cmd -match '(?:^|[;&|]\s*)cd\s+"([^"]+)"' -or $cmd -match "(?:^|[;&|]\s*)cd\s+'([^']+)'" -or $cmd -match '(?:^|[;&|]\s*)cd\s+([^\s;&|]+)') {
    if ($matches[1]) { $targetDir = $matches[1] }
} elseif ($cmd -match 'git\s+-C\s+"([^"]+)"' -or $cmd -match "git\s+-C\s+'([^']+)'" -or $cmd -match 'git\s+-C\s+([^\s]+)') {
    if ($matches[1]) { $targetDir = $matches[1] }
}
# On an unborn branch (no commits yet) rev-parse prints the literal string 'HEAD'
# with a nonzero exit; fall back to symbolic-ref which resolves the branch name.
$branch = git -C $targetDir rev-parse --abbrev-ref HEAD 2>$null
if (-not $branch -or $branch -eq 'HEAD') { $branch = git -C $targetDir symbolic-ref --short HEAD 2>$null }
if (-not $branch) { $branch = git -C $baseCwd rev-parse --abbrev-ref HEAD 2>$null }
if (-not $branch -or $branch -eq 'HEAD') { $branch = git -C $baseCwd symbolic-ref --short HEAD 2>$null }
if ($branch -eq 'main' -or $branch -eq 'master') {
    [Console]::Error.WriteLine("BLOCKED: effective branch is '$branch'. Per .claude/rules/git-workflow.md, do not commit/push directly to main. Create a branch: git checkout -b feat/<slug> and commit again.")
    exit 2
}
exit 0
