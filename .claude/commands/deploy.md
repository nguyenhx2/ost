---
description: Deploy to GitHub Releases (Tauri bundler, signed auto-update). Gated - explicit user request only, after the PR is approved and merged.
allowed-tools: Bash(git status), Bash(git log:*), Read
disable-model-invocation: true
---

Deploy OST to GitHub Releases (Tauri bundler, signed auto-update).

This command is GATED. It never runs automatically, never runs as a step inside another command,
and never runs to "finish" a task. It runs only when the user invokes it directly. It is excluded
from model invocation for exactly this reason: an agent must not be able to reach production on its
own initiative.

## Preconditions

Verify every one of these and REFUSE the deploy, with the reason, if any is unmet:

1. The PR is reviewed, approved, and merged into `main`.
2. The GitHub Actions `lint-and-test` pipeline on `main` is green and in a terminal state. Pending is
   not green, and presumed-green is not green.
3. `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` are present in GitHub Actions
   secrets. Confirm presence only: never read, print, or copy a secret value.
4. No product data leaves the machine as part of this flow: the release artifact ships no user keys,
   no captured audio/screenshots, no telemetry (security-privacy.md).

## Steps

1. Trigger `.github/workflows/release.yml` (`workflow_dispatch`, owner types the confirmation phrase).
   It fails closed if the signing secret is missing.
2. The workflow builds and signs the Windows bundle (NSIS + MSI) via `tauri-apps/tauri-action` from the
   merged commit on `main`, never from a local working tree, and opens a DRAFT GitHub Release.
3. The owner reviews the draft release notes and artifacts, then publishes by hand. This command never
   publishes a release itself.
4. Record the release in `docs/context/tool-changelog.md`: what shipped, from which commit, and how
   it was verified.

On failure: roll back, report what happened, and stop. Do not retry a failed deploy and do not
"fix forward" without the user's explicit go-ahead.
