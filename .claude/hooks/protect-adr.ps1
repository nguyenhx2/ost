# protect-adr.ps1
# Event: PreToolUse   Matcher: Edit|Write
# Protects docs/decisions.md, the append-only decision log.
#
# HISTORICAL NAME: this hook used to guard docs/architecture/decisions/ADR-*.md files with a
# `status: Accepted` frontmatter line (one file per decision). The harness-simplification PR
# (2026) consolidated every decision into ONE running file, so this hook was REPOINTED to guard
# that file instead of renamed - settings.json still refers to it as protect-adr.ps1, and
# renaming it would require a settings.json edit that is out of scope for this change.
#
# WHOLE-FILE protection, not per-entry: docs/decisions.md has no machine-checkable per-entry
# status marker (unlike the old ADR frontmatter), and "has shipped code against it" - the
# actual line the file draws for when an entry becomes immutable - is not something this hook
# can determine from the file alone. So the hook is conservative and protects EVERYTHING
# currently on disk, always, the moment it exists: the file is enforced as APPEND-ONLY.
#   - Edit is ALWAYS blocked for this file. The Edit tool replaces an existing substring by
#     definition, which this hook cannot distinguish from altering a past entry.
#   - Write is allowed ONLY when the new content begins with the exact current on-disk content
#     as a byte-for-byte prefix (i.e. a pure append - new text added after everything that was
#     already there, nothing above it changed or removed).
# To add a decision: append a new dated `## ` section at the end via Write, with the existing
# file content preserved unchanged above it. To revise a past decision: append a NEW entry that
# supersedes it (see docs/decisions.md's own header) - never edit the old entry in place.
#
# Contract: reads the PreToolUse JSON payload on stdin. exit 2 = BLOCK (message on stderr, shown
# to Claude); exit 0 = allow.

$ErrorActionPreference = 'Stop'

try {
    $raw = [Console]::In.ReadToEnd()
    if (-not $raw) { exit 0 }
    $payload = $raw | ConvertFrom-Json
} catch {
    exit 0   # unparseable payload: fail open, the settings.json deny rules remain the backstop
}

$path = $payload.tool_input.file_path
if (-not $path) { exit 0 }

# Resolve against the payload's cwd so a relative file_path is checked against the right file.
$base = if ($payload.cwd) { $payload.cwd } else { (Get-Location).Path }
try {
    $abs = if ([System.IO.Path]::IsPathRooted($path)) { $path } else { Join-Path $base $path }
    $abs = [System.IO.Path]::GetFullPath($abs)
} catch {
    $abs = $path
}

$norm = $abs -replace '\\', '/'
if ($norm -notmatch 'docs/decisions\.md$') { exit 0 }

# Not on disk yet: nothing to protect (first-ever creation of the file).
if (-not (Test-Path -LiteralPath $abs)) { exit 0 }

$existing = Get-Content -LiteralPath $abs -Raw -ErrorAction SilentlyContinue
if ($null -eq $existing) { exit 0 }

# Edit tool: always blocked for this file (see header comment for why).
if ($null -ne $payload.tool_input.old_string) {
    [Console]::Error.WriteLine("BLOCKED: docs/decisions.md is append-only. Edit replaces existing text, which this hook cannot distinguish from altering a past decision entry. Use Write to append a new dated section AFTER the existing content, byte-for-byte unchanged above it - never edit an entry in place. To revise a past decision, append a new entry that supersedes it.")
    exit 2
}

# Write tool: allowed only as a pure append (existing content preserved as an exact prefix).
if ($null -ne $payload.tool_input.content) {
    $newContent = $payload.tool_input.content
    if (-not $newContent.StartsWith($existing)) {
        [Console]::Error.WriteLine("BLOCKED: docs/decisions.md is append-only. This write would change or remove content that is already on disk. Append a new dated section after the existing text instead - the existing bytes must be an exact, unchanged prefix of the new file content.")
        exit 2
    }
}

exit 0
