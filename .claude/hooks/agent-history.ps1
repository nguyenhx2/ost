# agent-history.ps1 - PostToolUse (Task|Agent)
# Non-blocking audit trail: archives every completed subagent run (prompt + final
# response) as one markdown file in .claude/state/history/ (gitignored).
# Never blocks, never throws.
try {
    $payload = [Console]::In.ReadToEnd() | ConvertFrom-Json
    $dir = '.claude/state/history'
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    $agent = $payload.tool_input.subagent_type; if (-not $agent) { $agent = 'agent' }
    $desc = $payload.tool_input.description; if (-not $desc) { $desc = 'run' }
    $slug = ($desc.ToLower() -replace '[^a-z0-9]+', '-').Trim('-')
    if ($slug.Length -gt 48) { $slug = $slug.Substring(0, 48) }
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $rand = -join ((97..122) | Get-Random -Count 4 | ForEach-Object { [char]$_ })
    $file = Join-Path $dir "$stamp-$agent-$slug-$rand.md"
    $prompt = $payload.tool_input.prompt
    $response = $payload.tool_response | ConvertTo-Json -Depth 5
    @("# $agent - $desc", '', '## Prompt', '', '```', $prompt, '```', '', '## Response', '', '```', $response, '```') | Set-Content -Path $file -Encoding UTF8
} catch { }
exit 0
