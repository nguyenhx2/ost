---
title: "ADR-003: API keys stored in the OS keychain via the keyring crate"
status: Accepted
date: 2026-07-09
deciders: [nguyenhx2]
tags: [adr, security]
---

# ADR-003: API keys stored in the OS keychain via the keyring crate

## Context

Users enter paid API keys for up to four providers (FR-03). Key theft is the single worst
security failure this app can have. Storage must be cross-platform-capable, survive app
updates, and never place keys in plaintext files.

## Decision

Store provider keys exclusively in the OS credential store via the `keyring` crate:
Windows Credential Manager first (macOS Keychain / Linux Secret Service in Phase 4). A
single wrapper module `src-tauri/src/keys/` owns store/retrieve/delete; the WebView only
ever receives provider name + masked presence status. Keys never appear in the settings
store, logs, error messages, or IPC payloads.

## Options considered

| Option | Pros | Cons |
|--------|------|------|
| A (chosen) OS keychain (keyring crate) | OS-managed encryption, industry standard for desktop apps, nothing to back up or remember, per-user isolation | Not portable across machines (user re-enters keys) |
| B Tauri Stronghold plugin | Encrypted app-owned file, machine-portable | User must remember an extra password; heavier dependency |
| C App-encrypted config file | Simplest to build | Weakest: key-derivation and storage both DIY; unacceptable for paid keys |

## Consequences

- Positive: strongest available default; simple mental model; audits reduce to one module.
- Negative / trade-off: keys re-entered per machine; Linux Secret Service variability to
  handle in Phase 4.
- Follow-up work: TASK-006 implements the wrapper + provider key validation UX.

## References

- Project intake, 2026-07-09 (key storage question).
- .claude/rules/security-privacy.md
