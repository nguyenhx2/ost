# protect-adr.ps1 - PreToolUse (Edit|Write)
# Blocks edits to ADRs whose status is Accepted (ADRs are immutable; change = new ADR).
$payload = [Console]::In.ReadToEnd() | ConvertFrom-Json
$path = $payload.tool_input.file_path
if (-not $path) { exit 0 }
$norm = $path -replace '\\', '/'
if ($norm -match 'docs/architecture/decisions/ADR-\d+[^/]*\.md$') {
    if (Test-Path $path) {
        $head = Get-Content $path -TotalCount 10 -ErrorAction SilentlyContinue
        if ($head -match '^status:\s*Accepted') {
            [Console]::Error.WriteLine("BLOCKED: this ADR has status Accepted and is immutable. Create a new ADR with /new-adr and mark the old one 'Superseded by ADR-NNN' (only the status line may change).")
            exit 2
        }
    }
}
exit 0
