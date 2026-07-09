---
description: Create a TASK from the template in docs/tasks.
argument-hint: <short-title>
---

1. Determine the next TASK-NNN (sequential across active/, pending/, done/).
2. Copy `docs/templates/TASK.md.template` to `docs/tasks/active/TASK-NNN-<slug>.md`; fill
   title, goal, owner agent, deps, priority, phase, created date, acceptance criteria;
   status: Active (or Planned until dispatched).
3. Add the row to the index table in `docs/tasks/master-plan.md`; read it back to verify.
4. Append the first session-log row (task created and registered).
