---
title: "TASK-035: Local LLM managed server engine (backend)"
status: Active
fr: FR-03
owner: llm-integration-dev
deps: TASK-026
priority: P1
phase: 2
created: 2026-07-12
tags: [task, llm, local-inference, adr-006]
---

<!-- TASK FILES ARE WRITTEN 100% IN ENGLISH (see .claude/rules/task-tracking.md). -->

# TASK-035: Local LLM managed server engine (backend)

## Goal
Make OST download a GGUF translation model and manage a loopback `llama-server`
subprocess (ADR-006, Option B), reusing the shared model-download facility and
the existing `local_openai` provider client. Backend only - the Settings UI is a
separate frontend task built against the IPC contract defined here.

## Inputs / context
- Related FR: [FR-03](../../specs/05-functional-requirements.md#fr-03)
- ADR-006 (this task authors it, recording the owner's 2026-07-12 decision).
- Related files/modules: `src-tauri/src/llm/` (new), `src-tauri/src/models/`
  (reuse + generic download engine), `src-tauri/src/providers/local_openai.rs`
  and `local_models.rs` (reused unchanged), `docs/architecture/api-contracts/providers.md`.

## Scope exception (owner-approved, recorded)
llm-integration-dev normally owns only `providers/` + `keys/`. The coordinator
NARROWED this task to BACKEND and authorized a deliberate least-privilege
exception to also touch `docs/architecture/decisions/`, `src-tauri/src/models/`
(reuse/extend), a new `src-tauri/src/llm/`, and the IPC commands + contract docs.
The Settings "Local LLM" React tab is EXCLUDED - a frontend agent builds it
against this IPC contract. Recorded per instruction in ADR-006, the PR body, and
here.

## To do
- [x] ADR-006 (Accepted, deciders [nguyenhx2], 2026-07-12) + decisions README row.
- [x] Generic streaming download engine in `models/download.rs` (bounded,
      cancellable, incremental hash) - shared facility; STT keeps its own copy
      (stt/ out of scope).
- [x] GGUF registry `llm/model.rs` (Hy-MT2-7B default, Qwen3-14B, Hy-MT2-30B-A3B).
- [x] Consent-gated GGUF download `llm/download.rs` (pin OR trust-on-first-use).
- [x] `llama-server` process manager `llm/server.rs` (spawn/health/kill,
      loopback-only, one-at-a-time) behind an injected spawn+health abstraction.
- [x] Production OS backend + binary resolution `llm/process.rs`.
- [x] IPC commands: list/request/confirm/cancel/delete download + start/stop/status.
- [x] Wire into `lib.rs` (consent descriptor, managed state, kill-on-exit).
- [x] Update `docs/architecture/api-contracts/providers.md`.

## Test scenarios / acceptance
- [x] Download fails closed without consent; bounded/oversize/stall/cancel abort.
- [x] TOFU digest recorded on first download; pin mismatch rejected.
- [x] Manager: ready path, early-exit (crash isolation) detection, readiness
      timeout, one-at-a-time replace, missing binary/model, idempotent stop.
- [x] Loopback-only args; binary resolution order.
- [x] `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`,
      new-module `cargo test` green.

## Orchestration notes
- Digests NOT pinned (offline, cannot verify) - TOFU record-on-first-download,
  flagged for the owner to hard-pin. GGUF repo/filename UNVERIFIED offline.
- Binary LOCATED not bundled (Step 2/devops). GPU no-driver CPU fallback = Step 2.
- security-reviewer MANDATORY (egress + subprocess + port bind).

## Session log (AI session log)

| Date | Who | What was done | Result |
|------|-----|---------------|--------|
| 2026-07-12 | llm-integration-dev | Authored ADR-006; built `llm/` (model/download/server/process/mod) + `models/download.rs` generic engine; wired lib.rs + IPC; updated providers contract | 34 new unit tests green; fmt + clippy clean; PR opened (backend only, not merged) |

## Result
<Fill when moving to Done; link the PR/commit. Then move the file to docs/tasks/done/.>
