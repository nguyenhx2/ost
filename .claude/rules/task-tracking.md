# Rule: Task tracking

Task state lives in committed markdown under `docs/tasks/` - the task files, not
conversation memory, are the source of truth. Canonical operational procedure:
`~/.claude/skills/project-bootstrap/reference/task-control.md` (analyze/decompose/register/
lifecycle loop, worked example, crash recovery); on any conflict, THIS rule wins.

## Where state lives

- `docs/tasks/master-plan.md` - phases + index table (task, title, owner, deps, priority,
  phase, status).
- `docs/tasks/active/TASK-NNN-<slug>.md` - one file per task from
  `docs/templates/TASK.md.template`; moved to `done/` when finished, `pending/` when
  deliberately parked (with a recorded reason).

## States

Active | Blocked | Pending | Done. The task file frontmatter `status:` and the master-plan
Status column MUST always agree (update both in the same edit; verify board writes by
reading the row back).

## Mandatory workflow

- Task start: create the file via `/new-task`, register the master-plan row, first
  session-log row.
- During work: append a concise session-log row (date, agent, what was done, result) after
  every meaningful unit; decisions/blockers as bullets in orchestration notes.
- Resume (every new or compacted session): `/task-resume TASK-NNN` - read master-plan +
  task file, then verify the working tree (`git status`/`git diff`); files record intent,
  the tree records reality. After abnormal termination, reconcile worktrees/branches
  against the board before dispatching; agent status reports are claims to verify against
  git state, not facts.
- Done: fill the Result section, flip both statuses, move the file to `done/`. At
  close-out, audit that `done/` files and board rows agree 1:1.

## Hygiene

Task files are committed: 100% English, concise, no secrets, no real user data, no full
prompt dumps.
