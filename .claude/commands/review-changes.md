---
description: Run the merged review gate and secret scan on the current diff before opening a PR.
allowed-tools: Bash(git diff:*), Bash(git status), Bash(git log:*), Read, Grep, Glob
---

Review the current changes before opening a PR.

1. Get the diff: `git diff` and `git diff --staged`. For an existing branch use
   `git diff main...HEAD` (three dots, merge-base to tip). Two dots on a stale branch reports
   commits the branch is merely missing as deletions, producing false findings.
2. Run `/secret-scan`. Any real secret or sensitive data in the diff is a blocker: stop until
   the value is removed from the diff and the credential is rotated.
3. Dispatch `reviewer`: coding standards, the design-system hard gate, the security/privacy
   checklist (keys, captured content, prompt-injection defense), and the commit messages on
   the branch (`git log origin/main..HEAD --format=%s`) against `.claude/rules/git.md`.
4. Confirm `npm run lint`, `npm run test`, `cargo fmt --check`, and
   `cargo clippy --all-targets -- -D warnings` pass locally, and that the GitHub Actions
   `lint-and-test` pipeline is green in a terminal state. A pending pipeline is not a green
   pipeline.
5. Aggregate the findings by severity: blocker, should fix, suggestion.

Do not merge and do not deploy. Reviewing is not approving.
