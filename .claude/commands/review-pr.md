---
description: Run code review + security review on the current diff.
allowed-tools: Bash(git diff:*), Bash(git status), Bash(git log:*)
---

Review the current changes before opening/merging a PR.

1. Get the diff: `git diff` (and `git diff --staged`).
2. Run `/secret-scan` - any real secret or captured user content in the diff is a blocker;
   stop until removed and rotated.
3. Assign `code-reviewer`: coding standards + design-system hard gate + commit messages on
   the branch (`git log origin/main..HEAD --format=%s`) against `conventional-commits.md`.
4. Assign `security-reviewer`: key handling, captured-content policy, prompt-injection
   defense, guardrails.
5. Assign `spec-guardian`: verify acceptance criteria are met.
6. Aggregate findings by severity (blocker / should fix / suggestion). Do NOT merge, do NOT
   release.
