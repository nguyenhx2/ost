# check-commit-msg.ps1 - PreToolUse (Bash)
# Validates the subject of `git commit -m` against conventional-commits.md.
# Uses -cmatch/-cnotmatch (case-sensitive) - plain -match breaks lowercase checks.
$payload = [Console]::In.ReadToEnd() | ConvertFrom-Json
$cmd = $payload.tool_input.command
if (-not $cmd) { exit 0 }
if ($cmd -notmatch '(^|[;&|]\s*)git\s+commit\b') { exit 0 }
if ($cmd -match '--amend' -and $cmd -match '--no-edit') { exit 0 }
$msg = $null
if ($cmd -match '(?s)-m\s+"(.*?)"') { $msg = $Matches[1] }
elseif ($cmd -match "(?s)-m\s+'(.*?)'") { $msg = $Matches[1] }
if (-not $msg) { exit 0 }
$subject = ($msg -split "(`r)?`n")[0].Trim()
if ($subject -match '^(Merge|Revert)\b') { exit 0 }
$types = 'feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert'
$pattern = "^($types)(\([a-z0-9-]+\))?(!)?: \S.*$"
$problems = @()
if ($subject -cnotmatch $pattern) { $problems += "subject must match '<type>(<scope>)?: <description>' with lowercase type in [$types]" }
if ($subject.Length -gt 72) { $problems += "subject is $($subject.Length) chars (max 72)" }
if ($subject -cmatch '\.\s*$') { $problems += "subject must not end with a period" }
if ($subject -cmatch '^[a-z]+(\([a-z0-9-]+\))?(!)?: [A-Z]') { $problems += "description starts uppercase - use lowercase" }
if ($problems.Count -gt 0) {
    [Console]::Error.WriteLine("BLOCKED: commit message violates .claude/rules/conventional-commits.md:")
    foreach ($p in $problems) { [Console]::Error.WriteLine(" - $p") }
    [Console]::Error.WriteLine("Subject was: '$subject'. Example: feat(audio): add wasapi loopback capture")
    exit 2
}
exit 0
