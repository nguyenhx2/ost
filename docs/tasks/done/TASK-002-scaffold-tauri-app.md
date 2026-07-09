---
title: "TASK-002: Scaffold Tauri 2 + React 19 + Vite app skeleton"
status: Done
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
- [x] `cargo clippy -- -D warnings` and `npm run lint` pass; `npm run tauri dev` opens the
      window. (smoke test run 2026-07-09 on user request: ost.exe PID 11176, window title
      "OST", ~34.6MB RAM)

## Test scenarios / acceptance
- [x] `npm run tauri dev` launches; `cargo test` and `npx vitest run` pass (empty suites ok).
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
| 2026-07-09 | orchestrator | tauri dev window smoke test on user request: window "OST" opened (ost.exe PID 11176, ~34.6MB RAM), app killed cleanly after. NOTE: the Bash-tool sandbox blocks loopback - vite bound [::1]:1420 but connections stalled (SYN_RECEIVED); rerun without sandbox succeeded. Recorded in known-issues | Smoke test PASS |

## Result
Delivered on branch `feat/scaffold-tauri-app`, commits 64987da + 11e72f3 (merged to main
by the orchestrator after independent gate verification). Tauri 2 app skeleton: React 19 +
TS strict + Vite, eslint 10 flat config + prettier, vitest (2/2 tests on the typed IPC
wrapper), dark-first token seed, ui barrel, 8-module Rust skeleton compiling with 0
clippy warnings. Orchestrator re-ran vitest + lint independently (green) and
secret-scanned the branch diff (clean). Environment fixes recorded in
docs/context/known-issues.md: Windows 11 SDK 10.0.26100 installed (was missing), .bat
wrapper pattern for cargo under Git Bash, `-j 2` fallback for OS error 1455. Follow-up:
`npm run tauri dev` window smoke test is pending manual user verification.
