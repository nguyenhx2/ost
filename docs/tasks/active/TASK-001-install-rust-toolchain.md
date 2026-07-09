---
title: "TASK-001: Install Rust toolchain and verify build prerequisites"
status: Active
fr: "-"
owner: devops
deps: "-"
priority: P0
phase: 0
created: 2026-07-09
tags: [task]
---

# TASK-001: Install Rust toolchain and verify build prerequisites

## Goal
The dev machine can build Tauri 2 apps: rustup-installed stable Rust plus the Windows
prerequisites verified.

## Inputs / context
- Codebase analysis 2026-07-09: Node v22.17.0 and git 2.48.1 present; `cargo`/`rustc` NOT
  found on PATH.
- Tauri 2 Windows prerequisites: Microsoft C++ Build Tools (MSVC), WebView2 runtime
  (preinstalled on Windows 11), rustup stable toolchain.

## To do
- [ ] Install rustup (winget install Rustlang.Rustup or rustup.rs installer); default
      stable-msvc toolchain.
- [ ] Verify/install MSVC Build Tools (C++ workload).
- [ ] `cargo --version`, `rustc --version` succeed in a fresh shell.
- [ ] `cargo install tauri-cli` (or use `npm create tauri-app` in TASK-002 instead - note
      the choice here).

## Test scenarios / acceptance
- [ ] `rustc --version` and `cargo --version` print stable versions in a new terminal.
- [ ] `cargo new hello && cargo run` builds and runs (MSVC linker works).

## Orchestration notes
- Requires user interaction for installers (UAC); agent prepares commands, user runs them
  if elevation is needed.

## Session log (AI session log)

| Date | Who | What was done | Result |
|------|-----|---------------|--------|
| 2026-07-09 | orchestrator | Task created and registered in master-plan (bootstrap seed) | Active |
| 2026-07-09 | orchestrator | Bootstrap smoke test: /task-resume scan found this task; board row and frontmatter agree | Verified |

## Result
<Fill when moving to Done.>
