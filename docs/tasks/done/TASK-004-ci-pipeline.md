---
title: "TASK-004: CI pipeline green on the skeleton"
status: Done
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
- [ ] Branch protection: PR required, CI required to merge. DEFERRED - private repo on GitHub Free has no branch protection (403); owner decision 2026-07-09, see docs/context/known-issues.md.

## Test scenarios / acceptance
- [x] A test PR shows all jobs green (PR #1: lint-and-test pass; the one red run was pre-gitattributes and correctly failed). Server-side merge blocking deferred with branch protection.

## Session log (AI session log)

| Date | Who | What was done | Result |
|------|-----|---------------|--------|
| 2026-07-09 | orchestrator | Task created and registered in master-plan (bootstrap seed) | Planned |
| 2026-07-09 | orchestrator | User authorized: created private repo github.com/nguyenhx2/ost via gh, pushed main (525ba51) | Active |
| 2026-07-09 | orchestrator | Enabled real CI jobs on branch ci/enable-pipeline: windows-latest, npm+cargo caches, eslint+prettier, vitest, frontend build, cargo fmt/clippy/test; full tauri bundling deliberately left to the gated release flow | Active |
| 2026-07-09 | claude | Session recovery after garbled-output report: verified all tracked text files are valid UTF-8 and Vietnamese docs intact (garbling was console codepage display only, not file corruption); PR #1 CI green (lint-and-test pass, earlier failure was pre-gitattributes) | Active |
| 2026-07-09 | claude | Attempted branch protection on main (require PR + lint-and-test check): blocked by GitHub plan - private repo on Free tier has no branch protection/rulesets; needs owner decision (make repo public, upgrade to Pro, or defer) | Blocked item |
| 2026-07-09 | claude | Owner decided: defer branch protection (recorded in known-issues), close TASK-004 with CI green; task moved to done/ | Done |

## Result
CI is live and green: `.github/workflows/ci.yml` runs eslint+prettier, vitest, frontend
build (tsc+vite), cargo fmt/clippy/test on windows-latest with npm+cargo caches on every
PR and push to main. Verified on PR #1 (check `lint-and-test` pass). Full tauri bundling
left to the gated release flow. Branch protection deferred (GitHub Free + private repo,
owner decision 2026-07-09); local hooks enforce the no-direct-main discipline meanwhile.
