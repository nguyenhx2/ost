# Regression tests for guard-main-commit.ps1
#
# Run: powershell -NoProfile -ExecutionPolicy Bypass -File .claude/hooks/tests/guard-main-commit.tests.ps1
# Exit code 0 = all cases pass, 1 = at least one failed.
#
# Why this file exists: the hook silently read the WRONG repository's branch whenever the
# command used an MSYS/Git-Bash absolute path (`cd /d/Projects/...`). Windows reports
# IsPathRooted('/d/foo') as TRUE, so the path skipped normalization, `git -C /d/foo` resolved
# nothing, and the code fell back to the payload cwd's branch. That failed BOTH ways: it
# blocked legitimate commits from a worktree, and - the dangerous direction - it ALLOWED a
# commit targeting main whenever the payload cwd happened to sit on a feature branch. Case
# "fail-open" below is the one that must never regress.
#
# Every fixture is built from scratch in TEMP so the result does not depend on which branches
# or worktrees happen to exist in the developer's checkout.

$ErrorActionPreference = 'Stop'
$hook = Join-Path $PSScriptRoot '..\guard-main-commit.ps1' | Resolve-Path
$failures = 0
$fixtures = @()

# A repo with a real commit on $Branch. `git init` alone is not enough: an unborn HEAD makes
# `rev-parse --abbrev-ref HEAD` fail, the branch reads as empty, and the hook correctly
# declines to guess - which would make these cases pass for the wrong reason. The commit is
# created with plumbing (commit-tree/update-ref) because a plain `git commit` on main would be
# caught by the very hook under test.
function New-FixtureRepo {
    param([string]$Branch)
    $dir = Join-Path $env:TEMP ('guardhook-' + [guid]::NewGuid().ToString('N').Substring(0, 10))
    git init -q -b scratch $dir 2>$null | Out-Null
    Set-Content -LiteralPath (Join-Path $dir 'seed.txt') -Value 'seed' -Encoding utf8
    git -C $dir add seed.txt 2>$null | Out-Null
    $tree = git -C $dir write-tree
    $commit = git -C $dir -c user.name=t -c user.email=t@t commit-tree $tree -m seed
    git -C $dir update-ref refs/heads/scratch $commit 2>$null | Out-Null
    git -C $dir branch -m scratch $Branch 2>$null | Out-Null
    $script:fixtures += $dir
    return $dir
}

# MSYS/Git-Bash spelling of a Windows path: D:\a\b -> /d/a/b
function ConvertTo-PosixPath {
    param([string]$WinPath)
    '/' + $WinPath.Substring(0, 1).ToLower() + $WinPath.Substring(2).Replace('\', '/')
}

function Test-Case {
    param([string]$Name, [string]$Cwd, [string]$Command, [int]$Expected)

    $payload = @{ cwd = $Cwd; tool_input = @{ command = $Command } } | ConvertTo-Json -Compress
    $stdin = [System.IO.Path]::GetTempFileName()
    Set-Content -LiteralPath $stdin -Value $payload -NoNewline -Encoding utf8
    $proc = Start-Process -FilePath 'powershell' `
        -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $hook) `
        -RedirectStandardInput $stdin -NoNewWindow -Wait -PassThru
    Remove-Item $stdin -Force -ErrorAction SilentlyContinue

    if ($proc.ExitCode -eq $Expected) {
        Write-Output ("  ok    {0}" -f $Name)
    } else {
        Write-Output ("  FAIL  {0} (exit {1}, expected {2})" -f $Name, $proc.ExitCode, $Expected)
        $script:failures++
    }
}

try {
    $onMain = New-FixtureRepo -Branch 'main'
    $onFeature = New-FixtureRepo -Branch 'feat/example'

    Write-Output 'guard-main-commit.ps1'

    # Core protection: a commit or push while the effective branch is main/master is blocked.
    Test-Case 'blocks commit when cwd is on main' $onMain 'git commit -m x' 2
    Test-Case 'blocks push when cwd is on main' $onMain 'git push origin main' 2
    Test-Case 'blocks commit when cwd is on master' (New-FixtureRepo -Branch 'master') 'git commit -m x' 2

    # THE fail-open regression: an MSYS path naming a repo on main must be blocked even when
    # the payload cwd sits on a feature branch. The pre-fix hook returned 0 here.
    Test-Case 'blocks MSYS-path commit into a repo on main (fail-open regression)' `
        $onFeature ('cd ' + (ConvertTo-PosixPath $onMain) + ' && git commit -m x') 2
    Test-Case 'blocks git -C into a repo on main' `
        $onFeature ('git -C "' + $onMain + '" commit -m x') 2

    # The false-block regression: a worktree/checkout on a feature branch must be allowed,
    # whichever path spelling the command uses.
    Test-Case 'allows MSYS-path commit into a repo on a feature branch' `
        $onMain ('cd ' + (ConvertTo-PosixPath $onFeature) + ' && git commit -m x') 0
    Test-Case 'allows Windows-path commit into a repo on a feature branch' `
        $onMain ('cd "' + $onFeature + '" && git commit -m x') 0
    Test-Case 'allows commit when cwd itself is on a feature branch' $onFeature 'git commit -m x' 0

    # Fail closed: an explicitly named target dir whose branch cannot be resolved must block
    # rather than fall back to some other checkout's branch.
    Test-Case 'blocks when an explicit target dir cannot be resolved' `
        $onFeature 'cd /q/does/not/exist && git commit -m x' 2

    # Nothing to guard.
    Test-Case 'allows a non-git command' $onFeature 'ls -la' 0
    Test-Case 'allows when cwd is not a repo and no target is named' $env:SystemRoot 'git commit -m x' 0

    # The subcommand detection tolerates git's global options so `git -C <dir> commit` is seen.
    # That widening must NOT swallow read-only commands that merely mention commit/push: these
    # all run while cwd is on main, so an over-broad pattern shows up here as a spurious block.
    Test-Case 'allows git log even while on main' $onMain 'git log --oneline -5' 0
    Test-Case 'allows git log --grep=commit while on main' $onMain 'git log --grep=commit' 0
    Test-Case 'allows git status while on main' $onMain 'git status --short' 0
    Test-Case 'allows a branch named after a subcommand' $onMain 'git switch -c chore/commit-msg-tweak' 0
    Test-Case 'allows reading a file whose name contains commit' $onMain 'cat .claude/hooks/check-commit-msg.ps1' 0

    # Still blocked when the write subcommand really is there, with options in between.
    Test-Case 'blocks commit carrying -c overrides while on main' `
        $onMain 'git -c user.name=t -c user.email=t@t commit -m x' 2
} finally {
    foreach ($dir in $fixtures) {
        Remove-Item -LiteralPath $dir -Recurse -Force -ErrorAction SilentlyContinue
    }
}

if ($failures -gt 0) {
    Write-Output ("{0} case(s) failed" -f $failures)
    exit 1
}
Write-Output 'all cases passed'
exit 0
