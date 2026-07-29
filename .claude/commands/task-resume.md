---
description: Get oriented at the start of a session - working-tree state plus the open backlog.
allowed-tools: Bash(git status), Bash(git diff:*), Bash(git log:*), Read, Grep
---

Get oriented before starting or continuing work. There is no per-task file state anymore -
`docs/backlog.md` is the flat source of truth for open work, and the git tree is the source of
truth for what is actually done.

1. `git status` and `git diff` - report any uncommitted work. Never stash, discard, or clobber
   it; if it looks abandoned, ask before touching it.
2. `git log -10 --oneline` - recent history, to see what just landed.
3. Read `docs/backlog.md` and report what is open.
4. If the user named something specific to resume, cross-check it against the diff/log above
   rather than trusting a description of "what was done" at face value - the tree records
   reality.
