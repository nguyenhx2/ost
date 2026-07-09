---
description: Resume a task from its markdown task file (after compaction or in a new session).
argument-hint: <TASK-NNN> (omit to list all unfinished tasks)
---

1. If no argument: `grep -l "status: Active\|status: Blocked" docs/tasks/active/*.md` and
   list them.
2. Read `docs/tasks/master-plan.md` (position, deps, priority) and the task file (session
   log, decisions, blockers). Trust the files over conversation memory.
3. Verify the working tree (`git status` / `git diff`) - files record intent, the tree
   records reality. Then continue from the recorded state and keep logging.
