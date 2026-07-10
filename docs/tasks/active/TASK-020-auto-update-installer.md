---
title: "TASK-020: Auto-update + installer/bundler (gated release)"
status: Active
fr: "FR-05"
owner: devops
deps: "TASK-004"
priority: P1
phase: 3
created: 2026-07-10
tags: [task]
---

<!-- TASK FILES ARE WRITTEN 100% IN ENGLISH (see .claude/rules/task-tracking.md). -->

# TASK-020: Auto-update + installer/bundler (gated release)

## Goal
Set up the Tauri installer/bundler and signed auto-update via tauri-plugin-updater with CI-only signing keys; releases stay gated behind an explicit owner request.

## Inputs / context
- Related FR: [FR-05](../../specs/05-functional-requirements.md#fr-05); git-workflow.md release rule.
- Related files: `.github/workflows/`, `src-tauri/tauri.conf.json`, the bundler config.

## To do
- [ ] Tauri bundler config for the Windows installer.
- [ ] tauri-plugin-updater wired; update signing keys live ONLY in GitHub Actions secrets (never committed, never in the repo).
- [ ] A release workflow that builds/signs/publishes ONLY on an explicit owner request - never on the agent own initiative.
- [ ] Document the gated release procedure.

## Test scenarios / acceptance
- [ ] Signed update flow works; signing keys CI-only.
- [ ] Release is gated (build/sign/publish only on an explicit owner request).

## Orchestration notes
- RELEASE IS GATED. devops does not publish without an explicit owner request. Escalate for the actual release.

## Session log (AI session log)

| Date | Who | What was done | Result |
|------|-----|---------------|--------|
| 2026-07-10 | orchestrator | Task created and registered in master-plan (Phase B decomposition) | Planned |

## Result
<Fill when moving to Done; link the PR/commit. Then move the file to docs/tasks/done/.>
