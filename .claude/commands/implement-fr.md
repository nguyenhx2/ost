---
description: Plan and implement a functional requirement end-to-end per acceptance criteria.
argument-hint: <FR-id> (e.g. FR-02)
---

Implement functional requirement **$1**.

1. Read FR $1 in `docs/specs/05-functional-requirements.md`: input/output, business rules,
   acceptance criteria, use case. If the FR is not yet detailed, stop and run the
   spec-builder flow first (dispatch `ba-analyst`).
2. Use the `spec-guardian` agent to lock down the scope and criteria (including the
   performance budgets from `.claude/rules/tech-stack.md`).
3. Assign the specialist agent per the `orchestrator` routing table: FR-01 ->
   `audio-pipeline-dev`, FR-02 -> `screen-translate-dev`, FR-03 -> `llm-integration-dev`,
   FR-04 -> `frontend-ui-dev`, FR-05 -> cross-cutting via orchestrator. Implement using TDD
   (tests first, coordinate with `qa-test`).
4. Comply with `.claude/rules/` (especially human-in-the-loop and design-system).
5. Run `/test`. Then run `/review-pr`.
6. Do NOT release. Summarize the acceptance criteria that have been met.
