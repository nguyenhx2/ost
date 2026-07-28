---
title: "TASK-036: Deepen domain-model.md aggregate invariants per bounded context"
status: Planned # Active | Blocked | Pending | Done (Planned before dispatch)
fr: FR-05
owner: domain-modeler
deps: "-"
priority: P2
phase: 1
created: 2026-07-28
tags: [task, ddd, harness]
---

<!-- TASK FILES ARE WRITTEN 100% IN ENGLISH (see .claude/rules/task-tracking.md). -->

# TASK-036: Deepen domain-model.md aggregate invariants per bounded context

## Goal
Follow-up to the DDD agent-harness rebuild: `docs/architecture/domain-model.md` currently states
the context map, ubiquitous language, and the ACL rule at the level the harness rebuild needed.
This task deepens it per context with the actual aggregate boundaries and invariants the running
code already encodes, so the domain model documents reality rather than only the target shape.

## Inputs / context
- Related FR: [FR-05](../../specs/05-functional-requirements.md#fr-05) (cross-cutting
  architecture quality).
- Related files/modules: `docs/architecture/domain-model.md`, `.claude/rules/domain-model.md`,
  and, read-only, every module in the context map (`src-tauri/src/ocr/`, `stt/`, `providers/`,
  `llm/`, `capture/`, `audio/`, `src/`, `models/`, `shell/`, `commands/`, `keys/`, `core/`).
- This is a docs-only task; `domain-modeler`'s tool grant has no `Bash`, so verification is by
  reading the code, not running it.

## To do
- [ ] For each Core/Supporting context, state its aggregate root(s) and the invariant(s) it
      protects (e.g. Recognition: a `Segment` always carries a `Confidence` and a `Fidelity`;
      Translation: a `TranslationProposal` never wraps an unvalidated provider response).
- [ ] Confirm every trait listed as an ACL (`TranslationProvider`, `OcrEngine`, `SpeechToText`,
      `ScreenCapturer`, `AudioSource`) still matches its actual method signatures in code; note any
      drift.
- [ ] Confirm the IPC contract (`docs/architecture/api-contracts/ipc.md`) lists every command each
      context currently exposes; flag any command missing from the contract doc.
- [ ] Review whether `src-tauri/src/core/` (the shared kernel) has grown beyond
      `HeavySessionCoordinator` + `ResourceProbe` since the DDD rebuild; if so, decide case by case
      whether it belongs there or should move to its natural context owner.

## Test scenarios / acceptance
- [ ] `docs/architecture/domain-model.md` names an aggregate root + at least one stated invariant
      per Core and Supporting context.
- [ ] Every ACL trait's documented shape matches the code (spot-checked against the actual trait
      definition).
- [ ] No IPC command exists in code without a matching entry in `ipc.md`, or the gap is registered
      as a follow-up task.

## Orchestration notes
- Registered as part of the DDD agent-harness rebuild (this PR) so the reorganization has a
  concrete next step recorded on the board, per the task the rebuild was scoped to create.

## Session log (AI session log)

| Date | Who | What was done | Result |
|------|-----|---------------|--------|
| 2026-07-28 | orchestrator | Registered task as a follow-up to the DDD agent-harness rebuild PR. | Planned |

## Result
<Fill when moving to Done; link the PR/commit. Then move the file to docs/tasks/done/.>
