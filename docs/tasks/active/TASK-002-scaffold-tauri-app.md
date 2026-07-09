---
title: "TASK-002: Scaffold Tauri 2 + React 19 + Vite app skeleton"
status: Planned
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
- [ ] `npm create tauri-app@latest` (React + TypeScript + Vite template), app id/product
      name `ost`.
- [ ] Create empty Rust module skeleton: `audio/ stt/ capture/ ocr/ providers/ keys/
      shell/ commands/` (mod.rs each, compiles clean).
- [ ] tsconfig strict; eslint + prettier; `src/lib/ipc.ts` typed IPC wrapper stub;
      `src/styles/tokens.css` dark-first token seed; `src/components/ui/` barrel.
- [ ] `cargo clippy -- -D warnings` and `npm run lint` pass; `npm run tauri dev` opens the
      window.

## Test scenarios / acceptance
- [ ] `npm run tauri dev` launches; `cargo test` and `npx vitest run` pass (empty suites ok).
- [ ] Module skeleton compiles with no warnings.

## Session log (AI session log)

| Date | Who | What was done | Result |
|------|-----|---------------|--------|
| 2026-07-09 | orchestrator | Task created and registered in master-plan (bootstrap seed) | Planned |

## Result
<Fill when moving to Done.>
