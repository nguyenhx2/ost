# Regression tests for check-commit-msg.ps1
#
# Run: powershell -NoProfile -ExecutionPolicy Bypass -File .claude/hooks/tests/check-commit-msg.tests.ps1
# Exit code 0 = all cases pass, 1 = at least one failed.
#
# Why this file exists: the hook only ever read `-m "..."`, and bailed out with exit 0 on any
# other message source, commented as "git's own hooks own that path". This repo has NO git-level
# commit-msg hook (`.git/hooks` holds only `.sample` files, `core.hooksPath` unset), so
# `git commit -F-` fed by a heredoc - the natural way to write a multi-line message - skipped
# every conventional-commits check. The cases tagged "bypass regression" below returned 0 against
# the pre-fix script and must never return 0 again; that was verified by running them against the
# old script, not assumed.

$ErrorActionPreference = 'Stop'
$hook = Join-Path $PSScriptRoot '..\check-commit-msg.ps1' | Resolve-Path
$failures = 0
$tempFiles = @()

function Test-Case {
    param([string]$Name, [string]$Command, [int]$Expected, [string]$Cwd = $PSScriptRoot)

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

# Builds `git commit -F- <<'EOF' ... EOF`, the multi-line form that used to bypass the hook.
function New-HeredocCommand {
    param([string]$Message, [string]$Flag = '-F-')
    "git commit $Flag <<'EOF'`n$Message`nEOF"
}

try {
    Write-Output 'check-commit-msg.ps1'

    # --- Plain -m: the path that always worked. ---
    Test-Case 'allows a conformant subject' 'git commit -m "feat(ui): add the brand mark"' 0
    Test-Case 'blocks an unknown type' 'git commit -m "wip: poke at things"' 2
    Test-Case 'blocks an uppercase type' 'git commit -m "Feat(ui): add the brand mark"' 2
    Test-Case 'blocks an uppercase description' 'git commit -m "feat(ui): Add the brand mark"' 2
    Test-Case 'blocks a trailing period' 'git commit -m "feat(ui): add the brand mark."' 2
    Test-Case 'blocks a subject over 72 chars' `
        ('git commit -m "feat(ui): ' + ('x' * 70) + '"') 2
    Test-Case 'allows a Merge subject' 'git commit -m "Merge branch main into feat/x"' 0
    Test-Case 'allows --amend --no-edit' 'git commit --amend --no-edit' 0
    Test-Case 'allows a non-commit command' 'git log --oneline -5' 0
    Test-Case 'allows true editor flow (message does not exist yet)' 'git commit' 0

    # --- AI attribution, checked against the raw command so heredocs were already covered. ---
    Test-Case 'blocks a Co-Authored-By Claude trailer via -m' `
        'git commit -m "feat(ui): add mark

Co-Authored-By: Claude <noreply@anthropic.com>"' 2
    Test-Case 'blocks a Generated with Claude trailer in a heredoc' `
        (New-HeredocCommand "feat(ui): add mark`n`nGenerated with Claude Code") 2

    # --- BYPASS REGRESSIONS: heredoc-fed -F-. These returned 0 before the fix. ---
    Test-Case 'blocks a bad subject fed by heredoc to -F- (bypass regression)' `
        (New-HeredocCommand "Fixed the thing.") 2
    Test-Case 'blocks an unknown type fed by heredoc to -F- (bypass regression)' `
        (New-HeredocCommand "wip: poke at things`n`nsome body text") 2
    Test-Case 'blocks an over-long subject fed by heredoc (bypass regression)' `
        (New-HeredocCommand ('feat(ui): ' + ('x' * 70) + "`n`nbody")) 2
    Test-Case 'allows a conformant multi-line heredoc message' `
        (New-HeredocCommand "feat(ui): add the brand mark`n`nA body paragraph explaining why.`n`nRefs: FR-01") 0
    Test-Case 'handles the quoted-delimiter and dash forms' `
        (New-HeredocCommand "Fixed the thing." '--file=-') 2

    # --- NOT a bypass, kept as a guard. Verified against the pre-fix script: this form already
    #     returned 2, because whatever the non-greedy `-m "(.*?)"` captured also failed the
    #     subject pattern. It is here so the new heredoc-first extraction order does not turn a
    #     case that used to be caught into one that slips through. ---
    Test-Case 'blocks a bad subject inside -m "$(cat <<EOF ...)"' `
        "git commit -m `"`$(cat <<'EOF'`nFixed the thing.`nEOF`n)`"" 2

    # --- BYPASS REGRESSION: -F <file>. ---
    $badFile = [System.IO.Path]::GetTempFileName()
    $tempFiles += $badFile
    Set-Content -LiteralPath $badFile -Value "Fixed the thing." -Encoding utf8
    Test-Case 'blocks a bad subject read from -F <file> (bypass regression)' `
        ('git commit -F "' + $badFile + '"') 2

    $goodFile = [System.IO.Path]::GetTempFileName()
    $tempFiles += $goodFile
    Set-Content -LiteralPath $goodFile -Value "fix(audio): stop the capture thread within one second" -Encoding utf8
    Test-Case 'allows a conformant subject read from -F <file>' `
        ('git commit -F "' + $goodFile + '"') 0

    Test-Case 'allows a commit whose -F path does not exist (cannot inspect, does not guess)' `
        'git commit -F "Q:\nope\missing.txt"' 0
} finally {
    foreach ($f in $tempFiles) { Remove-Item -LiteralPath $f -Force -ErrorAction SilentlyContinue }
}

if ($failures -gt 0) {
    Write-Output ("{0} case(s) failed" -f $failures)
    exit 1
}
Write-Output 'all cases passed'
exit 0
