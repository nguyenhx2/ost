---
title: "TASK-004: CI pipeline green on the skeleton"
status: Active
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
- [x] Create the GitHub repo and push `main` (user authorized gh; private repo).
- [x] Enable the CI workflow (real jobs), cache cargo + npm, Windows runner.
- [ ] Branch protection: PR required, CI required to merge.

## Test scenarios / acceptance
- [ ] A test PR shows all jobs green; a lint-breaking PR shows red and blocks merge.

## Session log (AI session log)

| Date | Who | What was done | Result |
|------|-----|---------------|--------|
| 2026-07-09 | orchestrator | Task created and registered in master-plan (bootstrap seed) | Planned |
| 2026-07-09 | orchestrator | User authorized: created private repo github.com/nguyenhx2/ost via gh, pushed main (525ba51) | Active |
| 2026-07-09 | orchestrator | Enabled real CI jobs on branch ci/enable-pipeline: windows-latest, npm+cargo caches, eslint+prettier, vitest, frontend build, cargo fmt/clippy/test; full tauri bundling deliberately left to the gated release flow | Active |
| 2026-07-09 | claude | Session recovery after garbled-output report: verified all tracked text files are valid UTF-8 and Vietnamese docs intact (garbling was console codepage display only, not file corruption); PR #1 CI green (lint-and-test pass, earlier failure was pre-gitattributes) | Active |
| 2026-07-09 | claude | Attempted branch protection on main (require PR + lint-and-test check): blocked by GitHub plan - private repo on Free tier has no branch protection/rulesets; needs owner decision (make repo public, upgrade to Pro, or defer) | Blocked item |

## Result
<Fill when moving to Done.>
