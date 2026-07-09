---
title: "TASK-004: CI pipeline green on the skeleton"
status: Planned
fr: "-"
owner: devops
deps: "TASK-002"
priority: P1
phase: 0
created: 2026-07-09
tags: [task]
---

# TASK-004: CI pipeline green on the skeleton

## Goal
`.github/workflows/ci.yml` runs lint + cargo test + vitest + tauri build on every PR and
is green on the scaffolded skeleton.

## Inputs / context
- Bootstrap seeded a commented CI skeleton in `.github/workflows/ci.yml`; GitHub remote
  must exist first (create repo + `git remote add origin`).

## To do
- [ ] Create the GitHub repo and push `main` (user action for auth).
- [ ] Enable the CI workflow (uncomment), cache cargo + npm, Windows runner.
- [ ] Branch protection: PR required, CI required to merge.

## Test scenarios / acceptance
- [ ] A test PR shows all jobs green; a lint-breaking PR shows red and blocks merge.

## Session log (AI session log)

| Date | Who | What was done | Result |
|------|-----|---------------|--------|
| 2026-07-09 | orchestrator | Task created and registered in master-plan (bootstrap seed) | Planned |

## Result
<Fill when moving to Done.>
