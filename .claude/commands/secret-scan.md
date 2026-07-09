---
description: Scan for secrets and sensitive data in the current changes before commit/PR.
allowed-tools: Bash(git diff:*), Bash(git status), Grep, Read
---

Scan the diff for: key/token patterns (sk-, AKIA, AIza, ghp_, xox, JWT-shaped strings,
BEGIN PRIVATE KEY, hardcoded password=/api_key=/apikey=), forbidden files (.env*, *.pem,
*.key, *.pfx, service-account JSON, updater signing keys), and real-looking captured user
content (screenshots, transcripts, personal data) in fixtures. Report file:line + pattern
TYPE only - never print the matched secret value. Any hit = blocker.
