---
title: "TASK-002: Scaffold Tauri 2 + React 19 + Vite app skeleton"
status: Active
fr: "-"
owner: frontend-ui-dev
deps: "TASK-001"
priority: P0
phase: 0
created: 2026-07-09
tags: [task]
---

# TASK-002: Scaffold Tauri 2 + React 19 + Vite app skeleton

## Goal
A running empty Tauri app matching ADR-001: React 19 + TS strict + Vite frontend, Rust core
with the planned module skeleton, lint/format configured.

## Inputs / context
- ADR-001; `.claude/rules/tech-stack.md`, `coding-standards.md`, `design-system.md`.

## To do
- [x] `npm create tauri-app@latest` (React + TypeScript + Vite template), app id/product
      name `ost`.
- [x] Create empty Rust module skeleton: `audio/ stt/ capture/ ocr/ providers/ keys/
      shell/ commands/` (mod.rs each, compiles clean).
- [x] tsconfig strict; eslint + prettier; `src/lib/ipc.ts` typed IPC wrapper stub;
      `src/styles/tokens.css` dark-first token seed; `src/components/ui/` barrel.
- [ ] `cargo clippy -- -D warnings` and `npm run lint` pass; `npm run tauri dev` opens the
      window. (clippy + lint PASS; `tauri dev` window smoke test deferred to the user per
      dispatch brief)

## Test scenarios / acceptance
- [ ] `npm run tauri dev` launches; `cargo test` and `npx vitest run` pass (empty suites ok).
      (cargo test + vitest PASS; `tauri dev` launch pending manual user smoke test)
- [x] Module skeleton compiles with no warnings.

## Session log (AI session log)

| Date | Who | What was done | Result |
|------|-----|---------------|--------|
| 2026-07-09 | orchestrator | Task created and registered in master-plan (bootstrap seed) | Planned |
| 2026-07-09 | frontend-ui-dev | Dispatched; starting scaffold | Active |
| 2026-07-09 | frontend-ui-dev | Scaffolded create-tauri-app (react-ts template) into repo root; set productName `ost`, identifier `com.ost.app`, window title OST, crate `ost`/`ost_lib`; merged scaffold .gitignore entries | Done |
| 2026-07-09 | frontend-ui-dev | Added 8-module Rust skeleton (audio/stt/capture/ocr/providers/keys/shell/commands) declared in lib.rs; eslint 10 flat config + prettier + vitest; typed IPC wrapper `src/lib/ipc.ts` + 2 unit tests; dark-first `src/styles/tokens.css` + light override; `src/components/ui/` barrel; token-only OST placeholder screen | Done |
| 2026-07-09 | frontend-ui-dev | ENV FIX: Windows 10/11 SDK was missing (cargo link failed LNK1181 kernel32.lib; TASK-001 wrapper only verified cargo --version); installed Windows 11 SDK 10.0.26100 via winget. Also: the inline vcvars cmd wrapper breaks under Git Bash quoting - use a .bat wrapper file instead | Fixed |
| 2026-07-09 | frontend-ui-dev | Verification green: npm run lint PASS (eslint 10.6.0 + prettier 3.9.4); vitest 4.1.10 2/2 tests PASS; tsc --noEmit PASS; cargo check 0 warnings (2m17s first build); cargo clippy -D warnings PASS; cargo fmt --check PASS; cargo test ok (0 tests, empty suites). One cargo test run hit transient OS error 1455 (paging file) - rerun with `-j 2` passed | Green |

## Result
<Fill when moving to Done.>
