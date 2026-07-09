# Rule: Docs workflow

## Read/write map

| Path | Read level | Who writes |
|------|-----------|------------|
| docs/specs/ | ALWAYS before feature work | ba-analyst (spec-builder skill) |
| docs/requirements/ | when implementing the FR | ba-analyst |
| docs/architecture/system-overview.md | ALWAYS | dev agents via orchestrator |
| docs/architecture/decisions/ | before technical decisions | /new-adr; immutable once Accepted (hook) |
| docs/architecture/api-contracts/ | when IPC/provider contracts change | owning dev agent, same PR |
| docs/tasks/ | start and end of every session | orchestrator + owning agent |
| docs/context/ | when business context is needed | /sync-context |
| docs/templates/ | when creating new files | bootstrap only |

## Rules

- No new doc structures outside this map; new files come from `docs/templates/`.
- Requirement changes are logged in `docs/specs/13-revision-history.md` (hook-reminded).
- Language: docs prose in Vietnamese; task files, master-plan, and ADRs 100% English;
  codes/enums/filenames always English; everything under `.claude/` and root instruction
  files is English.
- Diagrams in Mermaid; links relative.
