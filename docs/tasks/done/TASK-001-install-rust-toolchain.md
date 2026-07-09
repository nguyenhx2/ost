---
title: "TASK-001: Install Rust toolchain and verify build prerequisites"
status: Done
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
| 2026-07-09 | user | Installed MSVC Build Tools, Rustlang.Rustup, GitHub CLI (session restart) | Installed |
| 2026-07-09 | orchestrator | Verified: cargo/rustc 1.96.1, gh 2.88.0; hello-world builds and runs under vcvars64 (exit 0) | Done |

## Orchestration notes (verification)
- rustc does NOT auto-detect MSVC when invoked from Git Bash: GNU coreutils `link` shadows
  MSVC `link.exe` on PATH, and with a clean PATH rustc's vswhere detection still failed
  against VS 18 Enterprise. WORKAROUND (mandatory for agent shells): run cargo through the
  developer environment, e.g.
  `cmd //c "\"C:\Program Files\Microsoft Visual Studio\18\Enterprise\VC\Auxiliary\Build\vcvars64.bat\" >nul 2>&1 && set PATH=%USERPROFILE%\.cargo\bin;%PATH% && cargo <args>"`.
  Recorded in docs/context/known-issues.md.
- `~/.cargo/bin` is not on the Git Bash session PATH; prefix commands with
  `export PATH="$USERPROFILE/.cargo/bin:$PATH"` or use the cmd wrapper above.

## Result
Rust stable 1.96.1 (rustup), MSVC VC Tools 14.50.35717 (VS 18 Enterprise), gh CLI 2.88.0,
Node v22.17.0 all verified on the dev machine. MSVC link test: `cargo run` on a fresh
crate exits 0 inside vcvars64. Follow-up: agents must use the vcvars64 wrapper for all
cargo commands from Git Bash (see known-issues.md). Tauri CLI decision: use
`npm create tauri-app` in TASK-002 (no global cargo install needed).
