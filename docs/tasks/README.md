# Tasks - OST

Task state lives here in committed markdown (100% English - see
`.claude/rules/task-tracking.md`):

- `master-plan.md` - phases + the index table of every task.
- `active/` - tasks in progress (`status: Active | Blocked`, plus `Planned` before
  dispatch).
- `pending/` - deliberately parked tasks with a recorded reason.
- `done/` - finished tasks.

Create tasks with `/new-task`; resume with `/task-resume TASK-NNN`. The task file
frontmatter and the master-plan Status column must always agree.
