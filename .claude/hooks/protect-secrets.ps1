# protect-secrets.ps1 - PreToolUse (Read|Edit|Write|Bash)
# Blocks file access to secrets (.env* except .env.example, key files, secrets dirs,
# service-account JSON) and shell commands that read/copy .env files.
$payload = [Console]::In.ReadToEnd() | ConvertFrom-Json
$secretPattern = '(^|/)\.env(\.[^/]+)?$|(^|/)(secrets?|credentials?)/|\.(pem|key|pfx|p12)$|service[-_]?account.*\.json$'
$allowPattern = '\.env\.example$'
$path = $payload.tool_input.file_path
if ($path) {
    $norm = $path -replace '\\', '/'
    if ($norm -match $secretPattern -and $norm -notmatch $allowPattern) {
        [Console]::Error.WriteLine("BLOCKED: this file may contain secrets ($norm). Per .claude/rules/agent-guardrails.md, agents do not read/edit secrets. Use .env.example for placeholders.")
        exit 2
    }
}
$cmd = $payload.tool_input.command
if ($cmd) {
    if ($cmd -match '(cat|type|more|less|head|tail|Get-Content|gc|copy|cp|echo)\s+[^\s]*\.env(\.[a-zA-Z0-9_-]+)?(\s|$|"|'')' -and $cmd -notmatch '\.env\.example') {
        [Console]::Error.WriteLine("BLOCKED: this command reads/copies a .env file. If you need the variable list, read .env.example.")
        exit 2
    }
}
exit 0
