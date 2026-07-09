# specs-reminder.ps1 - PostToolUse (Edit|Write)
# Non-blocking: when a file under docs/specs/ (except the revision-history file) is
# edited, injects a reminder to update the revision history and sync the PRD.
$payload = [Console]::In.ReadToEnd() | ConvertFrom-Json
$path = $payload.tool_input.file_path
if (-not $path) { exit 0 }
$norm = $path -replace '\\', '/'
if ($norm -match 'docs/specs/' -and $norm -notmatch '13-revision-history\.md$') {
    $out = @{ hookSpecificOutput = @{ hookEventName = 'PostToolUse'; additionalContext = 'Reminder: you just edited docs/specs/. If this is a requirement change (not a typo/format fix), update docs/specs/13-revision-history.md and sync the related PRD in docs/requirements/.' } } | ConvertTo-Json -Compress
    [Console]::Out.WriteLine($out)
}
exit 0
